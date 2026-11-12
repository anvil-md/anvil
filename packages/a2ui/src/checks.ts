/**
 * An @input field's checks (§4.3.1) as A2UI `@checks`.
 *
 * These run in the RENDERER, as a courtesy: they light the error under the
 * field and disable the submit button. They are not the authority. The bridge
 * runs `checkField` on every value that comes back (`stampAnswer`), because a
 * renderer's checks are one edited payload away from not running at all.
 *
 * So a check that does not map cleanly is left OUT here and still enforced
 * there. Today that is a `url`, `path` or `date` format, and a pattern A2UI's
 * static safety check (its §regex rules 1-4) might reject: A2UI refuses a
 * whole surface over one rejected pattern, and ANVIL matches in linear time
 * whatever the pattern says, so there is nothing to gain by sending it.
 */
import type { AnvilField } from '@anvil-md/parser'
import type { CheckRule, DataBinding, FunctionCall } from './types'

const LENGTH_TYPES = new Set(['text', 'longtext', 'path', 'secret', 'email', 'url'])

/** A2UI's limit is 256 code points; `^(?:` and `)$` take six. */
const MAX_PATTERN = 250

export function fieldChecks(field: AnvilField, path: string): CheckRule[] {
  const value: DataBinding = { '@path': path }
  const message = field.checks.error
  const rule = (condition: DataBinding | FunctionCall): CheckRule => (message ? { condition, message } : { condition })
  const out: CheckRule[] = []

  // A switch is required only in the sense that it must be ON (§4.3.1).
  if (field.type === 'bool') {
    if (field.required) out.push(rule(value))
    return out
  }
  if (field.required) out.push(rule({ '@call': 'required', args: { value } }))
  if (field.type === 'email') out.push(rule({ '@call': 'email', args: { value } }))

  const { min, max, pattern } = field.checks
  const bounds: Record<string, number> = {}
  if (min !== undefined) bounds.min = Number(min)
  if (max !== undefined) bounds.max = Number(max)
  if (Object.keys(bounds).length && LENGTH_TYPES.has(field.type)) {
    out.push(rule({ '@call': 'length', args: { value, ...bounds } }))
  } else if (Object.keys(bounds).length && field.type === 'number') {
    out.push(rule({ '@call': 'numeric', args: { value, ...bounds } }))
  }

  // ANVIL matches the WHOLE value; A2UI's regex searches. Anchor it.
  if (pattern !== undefined && a2uiSafe(pattern)) {
    out.push(rule({ '@call': 'regex', args: { value, pattern: `^(?:${pattern})$` } }))
  }
  return out
}

/**
 * Conservative: true only for a pattern none of A2UI's four safety rules can
 * reject. At most one unbounded quantifier anywhere (so rule 4, two adjacent
 * unbounded atoms, cannot fire), and no repeat above one on a group that holds
 * a quantifier or an alternation (rules 2 and 3). It refuses some patterns
 * A2UI would take. That costs a check run on the server instead of the
 * renderer; the opposite mistake costs the surface.
 */
export function a2uiSafe(pattern: string): boolean {
  if ([...pattern].length > MAX_PATTERN) return false
  let unbounded = 0
  /** Per open group: does it hold a quantifier or a `|`? */
  const groups: boolean[] = []
  let lastGroupRisky = false
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]
    let atomRisky = false
    if (ch === '\\') {
      i += 2
    } else if (ch === '[') {
      i++
      if (pattern[i] === '^') i++
      if (pattern[i] === ']') i++
      while (i < pattern.length && pattern[i] !== ']') i += pattern[i] === '\\' ? 2 : 1
      i++
    } else if (ch === '(') {
      groups.push(false)
      i++
      if (pattern[i] === '?') i += 2
      continue
    } else if (ch === ')') {
      atomRisky = groups.pop() ?? false
      // A group that holds a risky group is itself risky: `((a+)b){2}`.
      if (atomRisky && groups.length) groups[groups.length - 1] = true
      i++
    } else if (ch === '|') {
      if (groups.length) groups[groups.length - 1] = true
      i++
      continue
    } else {
      i++
    }
    lastGroupRisky = atomRisky
    const q = quantifier(pattern, i)
    if (!q) continue
    i = q.end
    if (q.unbounded) unbounded++
    if (q.repeats && lastGroupRisky) return false
    if (groups.length) groups[groups.length - 1] = true
  }
  return unbounded <= 1
}

/** The quantifier starting at `i`, if any. `repeats` = upper bound above one. */
function quantifier(p: string, i: number): { end: number; unbounded: boolean; repeats: boolean } | null {
  const ch = p[i]
  let end = i + 1
  let unbounded = false
  let repeats = false
  if (ch === '*' || ch === '+') {
    unbounded = true
    repeats = true
  } else if (ch === '?') {
    repeats = false
  } else if (ch === '{') {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i))
    if (!m) return null
    end = i + m[0].length
    const lo = Number(m[1])
    const hi = m[2] === undefined ? lo : m[3] === '' ? Number.POSITIVE_INFINITY : Number(m[3])
    unbounded = hi === Number.POSITIVE_INFINITY
    repeats = hi > 1
  } else {
    return null
  }
  if (p[end] === '?') end++
  return { end, unbounded, repeats }
}
