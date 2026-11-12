/**
 * Field checks on an @input (§4.3.1): what a value must look like before the
 * block may stamp.
 *
 * ONE FUNCTION, TWO CALLERS. The host runs `checkField` on every keystroke to
 * decide whether the submit button is live, and the server that receives the
 * stamp runs the same function again, because a stamp is untrusted input (§8.1)
 * and a client that skips its own checks is one curl away. Both callers import
 * this file, so there is nothing to keep in step.
 *
 * Every check is decided at PARSE time to be satisfiable or it is dropped with
 * a warning. A `min=5 max=2` that survived would lock the block forever: no
 * value passes, the button never lights, and the human cannot answer a question
 * the agent is waiting on. A missing check costs a bad value the server can
 * still refuse; an impossible one costs the conversation.
 */
import { compilePattern, matchPattern, type Pattern } from './pattern'
import type { AnvilBlock, AnvilField, FieldType } from './types'

/** What a field row may say about its value, already validated. */
export interface FieldChecks {
  /** Length in code points, a number, or an ISO date, depending on the type. */
  min?: string
  max?: string
  /** A pattern in the §4.3.1 dialect. Matched against the WHOLE value. */
  pattern?: string
  /** What the human is told when a check fails. The host's own words otherwise. */
  error?: string
}

/** Why a value failed. A host turns this into words unless `error=` already did. */
export type CheckReason = 'required' | 'format' | 'min' | 'max' | 'pattern'

export type FieldVerdict = { ok: true } | { ok: false; reason: CheckReason; error?: string }

/** The types whose min= and max= count characters. */
const LENGTH_TYPES = new Set<FieldType>(['text', 'longtext', 'path', 'secret', 'email', 'url'])

/** The types a pattern may constrain. A number or a date has a range instead. */
const PATTERN_TYPES = LENGTH_TYPES

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** No transcript field is longer than this; a bigger bound is a typo. */
const MAX_LENGTH_BOUND = 100_000

function length(s: string): number {
  let n = 0
  for (const _ of s) n++
  return n
}

function isDate(s: string): boolean {
  const m = ISO_DATE.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0
  return d <= days
}

function hasSpace(s: string): boolean {
  return /\s/.test(s)
}

/**
 * Deliberately loose. The only email check that is ever right is sending one,
 * and a stricter rule here refuses real addresses -- plus-tags, long TLDs, IDNs
 * -- that a human typed correctly and cannot change.
 */
function isEmail(s: string): boolean {
  if (hasSpace(s)) return false
  const at = s.split('@')
  if (at.length !== 2) return false
  const [local = '', domain = ''] = at
  if (!local || !domain) return false
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 1
}

function isUrl(s: string): boolean {
  if (hasSpace(s)) return false
  const m = /^https?:\/\/(.+)$/i.exec(s)
  return m !== null && (m[1] ?? '').length > 0
}

/** The shape every value of a type must have, before min/max/pattern are asked. */
const FORMATS: Partial<Record<FieldType, (v: string) => boolean>> = {
  number: v => NUMBER.test(v),
  date: isDate,
  email: isEmail,
  url: isUrl,
  bool: v => v === 'true' || v === 'false',
}

/** A bound, read for this type, or the reason it cannot be one. */
function bound(type: FieldType, raw: string): { ok: true; value: string } | { ok: false; why: string } {
  if (LENGTH_TYPES.has(type)) {
    if (!/^\d+$/.test(raw) || Number(raw) > MAX_LENGTH_BOUND) {
      return { ok: false, why: `is a length on a ${type} field, so it must be a whole number up to ${MAX_LENGTH_BOUND}` }
    }
    return { ok: true, value: String(Number(raw)) }
  }
  if (type === 'number') return NUMBER.test(raw) ? { ok: true, value: raw } : { ok: false, why: 'is not a number' }
  if (type === 'date') return isDate(raw) ? { ok: true, value: raw } : { ok: false, why: 'is not a YYYY-MM-DD date' }
  return { ok: false, why: `means nothing on a ${type} field` }
}

/** Orders two bounds of the same type. Dates compare as text because they are fixed width. */
function compare(type: FieldType, a: string, b: string): number {
  if (type === 'number') return Number(a) - Number(b)
  if (type === 'date') return a < b ? -1 : a > b ? 1 : 0
  return Number(a) - Number(b)
}

/** The cells a field row may carry after its positional ones. */
export const FIELD_CHECK_KEYS = ['min', 'max', 'pattern', 'error'] as const

/**
 * Validate the check cells a row carried and keep the ones that can work.
 * Everything dropped is named in a warning on the block.
 */
export function settleChecks(field: AnvilField, raw: Partial<Record<(typeof FIELD_CHECK_KEYS)[number], string>>, block: AnvilBlock): void {
  const where = `field "${field.name}"`
  const checks: FieldChecks = {}

  for (const key of ['min', 'max'] as const) {
    const v = raw[key]
    if (v === undefined) continue
    const b = bound(field.type, v)
    if (b.ok) checks[key] = b.value
    else block.warnings.push(`${where}: ${key}="${v}" ${b.why}; not checked`)
  }

  if (checks.min !== undefined && checks.max !== undefined && compare(field.type, checks.min, checks.max) > 0) {
    // Satisfiable or gone: an impossible range would lock the block forever.
    block.warnings.push(`${where}: min="${checks.min}" is above max="${checks.max}"; no value could pass, so neither is checked`)
    delete checks.min
    delete checks.max
  }

  if (raw.pattern !== undefined) {
    if (!PATTERN_TYPES.has(field.type)) {
      block.warnings.push(`${where}: pattern= does not apply to a ${field.type} field${field.type === 'bool' ? '' : '; use min= and max='}`)
    } else {
      const compiled = compilePattern(raw.pattern)
      if (compiled.ok) checks.pattern = raw.pattern
      else block.warnings.push(`${where}: pattern refused, ${compiled.why}; not checked`)
    }
  }

  if (raw.error !== undefined) {
    const hasCheck = field.required || checks.min !== undefined || checks.max !== undefined || checks.pattern !== undefined || FORMATS[field.type] !== undefined
    // Parsed and then never shown is the silent drop §11 forbids.
    if (hasCheck && raw.error) checks.error = raw.error
    else block.warnings.push(`${where}: error= has no check to explain; it is never shown`)
  }

  field.checks = checks
}

/** Compiled once per pattern string; the parse already proved it compiles. */
const compiled = new Map<string, Pattern | null>()

function patternFor(src: string): Pattern | null {
  if (!compiled.has(src)) {
    const v = compilePattern(src)
    // The cache is bounded by the patterns a process has ever been shown, and
    // each is at most MAX_PATTERN_LENGTH; still, never let it grow unchecked.
    if (compiled.size > 512) compiled.clear()
    compiled.set(src, v.ok ? v.pattern : null)
  }
  return compiled.get(src) ?? null
}

function fail(reason: CheckReason, field: AnvilField): FieldVerdict {
  return field.checks.error ? { ok: false, reason, error: field.checks.error } : { ok: false, reason }
}

/**
 * The verdict for one value. `value` is what the control holds as text: a
 * switch is `"true"` or `"false"`, a date is `YYYY-MM-DD`.
 *
 * An EMPTY optional field passes without running anything else. Asking a human
 * to satisfy the pattern of a field they were told they could skip is how a
 * form tells them they could not.
 */
export function checkField(field: AnvilField, value: string): FieldVerdict {
  const v = String(value ?? '')

  // A switch always has a value, so "required" can only mean "must be on" --
  // the consent box, the one case a required switch exists for.
  if (field.type === 'bool') {
    if (v !== '' && v !== 'true' && v !== 'false') return fail('format', field)
    return field.required && v !== 'true' ? fail('required', field) : { ok: true }
  }

  if (v.trim() === '') return field.required ? fail('required', field) : { ok: true }

  const format = FORMATS[field.type]
  if (format && !format(v)) return fail('format', field)

  const { min, max, pattern } = field.checks
  const measure = LENGTH_TYPES.has(field.type) ? String(length(v)) : v
  if (min !== undefined && compare(field.type, measure, min) < 0) return fail('min', field)
  if (max !== undefined && compare(field.type, measure, max) > 0) return fail('max', field)

  if (pattern !== undefined) {
    const p = patternFor(pattern)
    if (p && !matchPattern(p, v)) return fail('pattern', field)
  }
  return { ok: true }
}

/** Every field of a block, checked. True when the block may stamp. */
export function inputReady(block: AnvilBlock, values: Record<string, string>): boolean {
  return block.fields.every(f => checkField(f, Object.hasOwn(values, f.name) ? (values[f.name] ?? '') : '').ok)
}
