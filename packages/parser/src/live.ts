/**
 * Live rows (§4.1.2): a @choice or @gallery whose options come from a host
 * function at answer time, instead of from the agent's text.
 *
 * `query="calendar.free date=2026-11-20 minutes=30"` names a function the HOST
 * owns and its arguments. The host calls it when the block becomes
 * answerable, and the rows that come back replace the authored ones.
 *
 * THREE RULES KEEP THIS INSIDE THE AXIOM (§1):
 *
 * 1. The function is a QUERY, which is why the attribute is called that. It
 *    reads availability, contacts, slots; it never books, sends or writes. The
 *    only thing that happens in ANVIL is a stamp.
 * 2. The model is not in the loop. The host answers the call from its own
 *    registry, so a slow or chatty model cannot make a picker hang, and an
 *    agent cannot use a block to run a tool behind the human's back.
 * 3. The stamp records every row that was OFFERED. Calling the function again
 *    tomorrow returns tomorrow's slots, so a stamped block that re-fetched
 *    would show options the human never saw. The record carries its own.
 *
 * The authored `-` rows are the FALLBACK: what a host with no such function, a
 * failed call, or a renderer that never heard of live rows shows instead.
 */
import type { AnvilBlock, AnvilOption } from './types'
import { attrString } from './types'

export interface LiveSource {
  /** Dotted lowercase name: `calendar.free`. */
  fn: string
  /** Arguments as written. Strings, always: the host's schema types them. */
  args: Record<string, string>
}

/** The kinds whose rows can come from a function: the ones with picked rows. */
export const LIVE_KINDS = new Set(['choice', 'gallery'])

const FN_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
const ARG = /([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|(\S+))/g

/** No live block takes more arguments than a sentence can explain. */
export const MAX_LIVE_ARGS = 12

/** The source a block names, or null. Never throws, whatever `query=` says. */
export function liveSource(block: AnvilBlock): LiveSource | null {
  const raw = attrString(block, 'query').trim()
  if (!raw || !LIVE_KINDS.has(block.kind)) return null
  const [head = '', ...rest] = raw.split(/\s+/)
  if (!FN_NAME.test(head)) return null
  const args: Record<string, string> = {}
  let n = 0
  for (const m of rest.join(' ').matchAll(ARG)) {
    const key = m[1]
    if (!key || n >= MAX_LIVE_ARGS || Object.hasOwn(args, key)) continue
    // defineProperty, not assignment: `__proto__=x` must land as an own
    // property called __proto__, never reach the prototype setter.
    Object.defineProperty(args, key, { value: m[2] ?? m[3] ?? m[4] ?? '', enumerable: true, writable: true, configurable: true })
    n++
  }
  return { fn: head, args }
}

/** Everything wrong with a `query=`, as warnings (§11: never parsed and dropped). */
export function liveProblems(block: AnvilBlock): string[] {
  const raw = block.attrs.query
  if (raw === undefined) return []
  if (typeof raw !== 'string' || !raw.trim()) return ['query= names no function; the written rows are shown']
  if (!LIVE_KINDS.has(block.kind)) {
    return [`query= only fills @choice and @gallery rows; on @${block.kind} it is ignored`]
  }
  const [head = '', ...rest] = raw.trim().split(/\s+/)
  if (!FN_NAME.test(head)) {
    return [`query="${head}" is not a function name like calendar.free; the written rows are shown`]
  }
  const out: string[] = []
  const words = rest.join(' ')
  const stray = words.replace(ARG, '').trim()
  if (stray) out.push(`query= arguments are key=value; "${stray}" is ignored`)
  const keys = [...words.matchAll(ARG)].map(m => m[1])
  const twice = keys.filter((k, i) => keys.indexOf(k) !== i)
  if (twice.length) out.push(`query= names ${twice[0]} twice; the first is used`)
  if (new Set(keys).size > MAX_LIVE_ARGS) out.push(`query= takes at most ${MAX_LIVE_ARGS} arguments; the rest are ignored`)
  if (!block.options.length) {
    // Not an error: a host with the function shows its rows. But every other
    // host shows an empty question, so the agent should know it wrote one.
    out.push(`query=${head} has no written rows to fall back on; a host without it shows no options`)
  }
  return out
}

const ROW_TEXT = ['hint', 'img', 'font', 'sample', 'alt'] as const

/** A function's rows past this are drawn and warned about, like written rows (§11). */
const LIVE_ROW_WARN = 12

/**
 * A function's answer, turned into rows. The result is DATA from outside the
 * transcript, so it is read field by field: a row with no value is refused, a
 * non-string is ignored, and the same allowlists as written rows apply at
 * render time (§8.3). Duplicate values keep the first: a stamp names a row by
 * its value, and two rows answering to one value is a stamp that cannot say
 * which was picked.
 */
export function liveRows(result: unknown): { options: AnvilOption[]; warnings: string[] } {
  const warnings: string[] = []
  const list = Array.isArray(result) ? result : []
  if (!Array.isArray(result)) warnings.push('the function did not return a list of rows')
  const seen = new Set<string>()
  const options: AnvilOption[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push('a row that is not an object was skipped')
      continue
    }
    const rec = item as Record<string, unknown>
    // A whole number is accepted as its digits. A fraction is not: `0.1` has
    // no one spelling every language agrees on, and a value is compared as text.
    const get = (k: string): string | undefined => {
      const v = Object.hasOwn(rec, k) ? rec[k] : undefined
      return typeof v === 'string' ? v : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : undefined
    }
    const value = get('value')?.trim()
    if (!value) {
      warnings.push('a row with no value was skipped')
      continue
    }
    if (seen.has(value)) {
      warnings.push(`two rows answer to "${value}"; the second was skipped`)
      continue
    }
    seen.add(value)
    const opt: AnvilOption = { value, label: get('label')?.trim() || value }
    for (const k of ROW_TEXT) {
      const v = get(k)?.trim()
      if (v) opt[k] = v
    }
    const swatch = Object.hasOwn(rec, 'swatch') ? rec.swatch : undefined
    if (Array.isArray(swatch)) {
      const colours = swatch.filter((c): c is string => typeof c === 'string')
      if (colours.length) opt.swatch = colours
    }
    if (Object.hasOwn(rec, 'danger') && rec.danger === true) opt.danger = true
    options.push(opt)
  }
  if (options.length > LIVE_ROW_WARN) {
    warnings.push(`${options.length} live rows is past the point a human scans; all are shown`)
  }
  return { options, warnings }
}
