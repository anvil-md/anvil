/**
 * Row parsers: the `-`, `_`, `%` and `+` lines. Split out of parse.ts so the
 * line loop there stays a thin dispatch and both files stay readable.
 *
 * Every function here is total: a malformed row records a warning on the block
 * and returns, never throws.
 */
import type { AnvilBlock, AnvilOption, FieldType, TaskState } from './types'
import { FIELD_TYPES } from './types'

const FIELD_TYPE_SET = new Set<string>(FIELD_TYPES)

/** Split on unescaped pipes, then unescape. Trims each cell. */
function cells(s: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (ch === '|') {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

/** Trailing `key=value` cells on an option row. Order-independent. */
const CELL_SETTERS: Record<string, (opt: AnvilOption, val: string) => void> = {
  img: (o, v) => {
    o.img = v
  },
  font: (o, v) => {
    o.font = v
  },
  sample: (o, v) => {
    o.sample = v
  },
  swatch: (o, v) => {
    o.swatch = v
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)
  },
}

const CELL_KV = /^(img|swatch|font|sample)\s*=\s*(.*)$/i

/** `- [!]value | Label | hint | img=… | swatch=… | font=… | sample=…` */
export function parseOption(rest: string, block: AnvilBlock): void {
  const parts = cells(rest)
  let head = parts.shift() ?? ''
  const danger = head.startsWith('!')
  if (danger) head = head.slice(1).trim()
  if (!head) {
    block.warnings.push('option row with no value')
    return
  }

  const opt: AnvilOption = { value: head, label: head }
  if (danger) opt.danger = true

  const positional: string[] = []
  for (const cell of parts) {
    const kv = CELL_KV.exec(cell)
    const setter = kv ? CELL_SETTERS[(kv[1] ?? '').toLowerCase()] : undefined
    if (!setter) {
      positional.push(cell)
      continue
    }
    setter(opt, (kv?.[2] ?? '').replace(/^["']|["']$/g, '').trim())
  }
  if (positional[0]) opt.label = positional[0]
  if (positional[1]) opt.hint = positional[1]
  block.options.push(opt)
}

function titleCase(name: string): string {
  return name.replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase())
}

/** `_ name[*] | type | Label | placeholder` */
export function parseField(rest: string, block: AnvilBlock): void {
  const [rawName = '', rawType = '', label = '', placeholder = ''] = cells(rest)
  const required = rawName.endsWith('*')
  const name = (required ? rawName.slice(0, -1) : rawName).trim()
  if (!name) {
    block.warnings.push('field row with no name')
    return
  }
  const lower = rawType.toLowerCase()
  const known = FIELD_TYPE_SET.has(lower)
  if (rawType && !known) block.warnings.push(`unknown field type "${rawType}", using text`)
  block.fields.push({
    name,
    type: known ? (lower as FieldType) : 'text',
    label: label || titleCase(name),
    placeholder: placeholder || undefined,
    required,
  })
}

/**
 * The four checkbox states, keyed by the character between the brackets.
 *
 * Markdown task-list syntax on purpose. It is the one status notation every
 * human and every model already reads, it greps, and it still says the right
 * thing in the code-block fallback when a host has never heard of @card.
 * `/` and `-` are accepted as in-flight because editors that extend the
 * markdown checkbox use them and an agent will have seen both.
 */
const TASK_STATE_CHAR: Record<string, TaskState> = {
  ' ': 'todo',
  '': 'todo',
  x: 'done',
  X: 'done',
  '~': 'flight',
  '/': 'flight',
  '-': 'flight',
  '!': 'blocked',
}

/** Matches the leading `[x]` on a task row and hands back the rest of the line. */
export const TASK_BOX = /^\[([^\]]?)\]\s*(.*)$/

export function taskState(char: string): TaskState | null {
  return TASK_STATE_CHAR[char] ?? null
}

/**
 * A child's own count: either the whole meta cell, or the tail of it after an
 * EXPLICIT separator.
 *
 * The separator has to be explicit -- `·` or `,` -- and a space will not do.
 * With a space, `due 24/12` parses as twelve of twelve and renders the card
 * 100% done, which is the precise lie @card exists to prevent, reachable from
 * an ordinary due date. `Kit · 6/6` still works, because the agent wrote a
 * separator that means "and now a different fact".
 */
const ROLLUP = /(^|\s*[·,]\s*)(\d{1,4})\s*\/\s*(\d{1,4})\s*$/
const ROLLUP_ANYWHERE = /\d{1,4}\s*\/\s*\d{1,4}/

/**
 * `- [x] ref | Label | meta`
 *
 * Same cells as an option row -- `value | label | hint` -- because a task IS an
 * option that already has an answer, and inventing a second cell grammar for
 * the same shape would be two things to remember instead of one.
 *
 * An `n/m` in the meta cell is a child's own progress (an epic listing stories).
 * It is read into `done`/`total` so the parent's bar can sum it; see
 * taskProgress in types.ts.
 */
export function parseTask(state: TaskState, rest: string, block: AnvilBlock): void {
  const [ref = '', label = '', meta = ''] = cells(rest)
  if (!ref) {
    block.warnings.push('task row with no ref')
    return
  }

  const roll = ROLLUP.exec(meta)
  let done = roll ? Number.parseInt(roll[2] ?? '', 10) : undefined
  let total = roll ? Number.parseInt(roll[3] ?? '', 10) : undefined

  // A child claiming 9 of 4 is not a count that needs clamping, it is a typo.
  // Clamping laundered it into a confident 4/4 -- a `[ ]` row rendering as 100%
  // done. Refuse it and say why.
  if (done !== undefined && total !== undefined && done > total) {
    block.warnings.push(`"${done}/${total}" claims more done than total; not rolled up`)
    done = undefined
    total = undefined
  }

  const rolled = done !== undefined && total !== undefined
  // What is left of the cell once the count is lifted out of it.
  const metaText = rolled && roll ? meta.slice(0, roll.index + (roll[1] ?? '').length).replace(/[\s·,]+$/, '') : meta

  if (!roll && ROLLUP_ANYWHERE.test(meta)) {
    // Mid-cell is genuinely ambiguous -- "PR 3/7 checks" is not a rollup, and
    // neither is "due 24/12" -- so it is refused out loud rather than guessed at.
    block.warnings.push(`"${meta}" looks like a count but is not a rollup; write "· ${'n/m'}" to roll it up`)
  }

  block.tasks.push({
    state,
    ref,
    label: label || ref,
    meta: metaText,
    detail: '',
    ...(rolled ? { done, total } : {}),
  })
}

/**
 * `+ 5 pts | high | Sprint 24` -- a card's chip strip, or one attachment on a
 * @message. One entry per line, cells kept apart; see AnvilBlock.meta.
 */
export function parseMeta(rest: string, block: AnvilBlock): void {
  const row = cells(rest).filter(Boolean)
  if (row.length) block.meta.push(row)
}

/** `% name | leftPole | rightPole | default` */
export function parseDial(rest: string, block: AnvilBlock, steps: number): void {
  const [name = '', left = '', right = '', def = ''] = cells(rest)
  if (!name) {
    block.warnings.push('scale row with no name')
    return
  }
  const parsed = Number.parseInt(def, 10)
  const fallback = Math.ceil(steps / 2)
  const value = Math.min(steps, Math.max(1, Number.isFinite(parsed) ? parsed : fallback))
  block.dials.push({ name, left: left || 'Less', right: right || 'More', value })
}
