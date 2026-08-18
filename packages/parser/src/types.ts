/**
 * ANVIL -- Agent-Native Visual Interaction Language.
 *
 * The document model. An agent writes an ```anvil fence mid-sentence and a host
 * renders it as real UI in place, instead of as a code block.
 *
 * The parser is deliberately TOTAL -- see parse.ts. This is agent-authored
 * content arriving token by token, so a throw here would take down whatever
 * surface is rendering the surrounding conversation.
 */

export type AnvilKind =
  | 'choice'
  | 'gallery'
  | 'input'
  | 'scale'
  | 'note'
  | 'card'
  | 'board'
  | 'message'
  | 'grid'
  | 'stack'

export const ANVIL_KINDS: readonly AnvilKind[] = [
  'choice',
  'gallery',
  'input',
  'scale',
  'note',
  'card',
  'board',
  'message',
  'grid',
  'stack',
]

/**
 * How a @message is drawn. The list is closed: a channel nobody has written
 * chrome for renders as a plain memo with a warning, which is honest, rather
 * than as a WhatsApp bubble that is not WhatsApp.
 */
export type MessageChannel =
  | 'email'
  | 'whatsapp'
  | 'imessage'
  | 'sms'
  | 'signal'
  | 'telegram'
  | 'slack'
  | 'discord'
  | 'memo'

export const MESSAGE_CHANNELS: readonly MessageChannel[] = [
  'email',
  'whatsapp',
  'imessage',
  'sms',
  'signal',
  'telegram',
  'slack',
  'discord',
  'memo',
]

/** Which chrome a channel wears. Three shapes cover every channel worth drawing. */
export type MessageChrome = 'envelope' | 'bubble' | 'channel'

const CHROME: Record<MessageChannel, MessageChrome> = {
  email: 'envelope',
  memo: 'envelope',
  whatsapp: 'bubble',
  imessage: 'bubble',
  sms: 'bubble',
  signal: 'bubble',
  telegram: 'bubble',
  slack: 'channel',
  discord: 'channel',
}

export function messageChrome(channel: MessageChannel): MessageChrome {
  return CHROME[channel] ?? 'envelope'
}

/**
 * Layout containers. They hold other blocks and nothing else: no id, no stamp,
 * no presence in the answer half of the spec. Layout cannot be answered, so it
 * must never look answerable.
 */
export const CONTAINER_KINDS: readonly AnvilKind[] = ['grid', 'stack']

const CONTAINER_SET = new Set<string>(CONTAINER_KINDS)

export function isContainer(kind: string): boolean {
  return CONTAINER_SET.has(kind)
}

/** How deep layout may nest. A grid holding a stack is the floor and the ceiling. */
export const MAX_LAYOUT_DEPTH = 2

/** How a @gallery draws each card. */
export type GalleryRender = 'image' | 'swatch' | 'type' | 'card'

export type FieldType = 'text' | 'longtext' | 'number' | 'bool' | 'secret' | 'path' | 'url' | 'date'

export const FIELD_TYPES: readonly FieldType[] = ['text', 'longtext', 'number', 'bool', 'secret', 'path', 'url', 'date']

/** A `-` row: an option in a @choice or a card in a @gallery. */
export interface AnvilOption {
  value: string
  label: string
  hint?: string
  /** `- !wipe | ...` marks this single row destructive. */
  danger?: boolean
  img?: string
  swatch?: string[]
  font?: string
  sample?: string
}

/** A `_` row in an @input. */
export interface AnvilField {
  name: string
  type: FieldType
  label: string
  placeholder?: string
  required: boolean
}

/** A `%` row in a @scale. */
export interface AnvilDial {
  name: string
  left: string
  right: string
  /** 1-based notch, clamped into the block's step count. */
  value: number
}

export type TaskState = 'todo' | 'flight' | 'done' | 'blocked'

export const TASK_STATES: readonly TaskState[] = ['todo', 'flight', 'done', 'blocked']

/**
 * A `- [x] ref | Label | meta` row in a @card or @board.
 *
 * Deliberately the same cell grammar as an option row -- `value | label | hint`
 * -- with a checkbox in front. A task is an option that already has an answer.
 */
export interface AnvilTask {
  state: TaskState
  /** First cell. Doubles as the label when no second cell was given. */
  ref: string
  label: string
  /** Free-text third cell: assignee, blocker, whatever the agent wants shown. */
  meta: string
  /** `>` continuation lines under this row. */
  detail: string
  /** Set when the meta cell was an `n/m` rollup, e.g. a child story's own count. */
  done?: number
  total?: number
}

/** Derived, never authored. See §4.12: there is no `progress=` attribute. */
export interface AnvilProgress {
  done: number
  total: number
  /** 0-100, rounded. 0 when there is nothing to count. */
  pct: number
  counts: Record<TaskState, number>
  /** True when at least one row carried its own `n/m` and the bar sums children. */
  rollup: boolean
}

export type NoteTone = 'info' | 'warn' | 'danger'

export interface AnvilBlock {
  kind: AnvilKind
  /**
   * Author-supplied `id=`, else derived from the block body (stable).
   * Empty string on a container: layout has no identity and never stamps.
   */
  id: string
  /** Set when the id was derived rather than authored. */
  derivedId: boolean
  prompt: string
  subtext: string
  /** Bare attrs land as `true`. */
  attrs: Record<string, string | boolean>
  options: AnvilOption[]
  fields: AnvilField[]
  dials: AnvilDial[]
  /** `- [ ]` rows, for @card and @board. */
  tasks: AnvilTask[]
  /**
   * `+` rows, one entry per LINE, split into cells.
   *
   * Rows rather than a flat cell list because the two consumers disagree about
   * what a line means: a card's chip strip wants every cell as its own chip,
   * while a message's `+ patch.diff | 4 KB` is ONE attachment with a name and a
   * size. Flattening here made the size a second attachment.
   */
  meta: string[][]
  /** Blocks inside a @grid or @stack. Always empty for a leaf. */
  children: AnvilBlock[]
  /** `>` lines, for @note. */
  prose: string
  /** Non-fatal parse complaints, surfaced in the rendered block. */
  warnings: string[]
}

export interface AnvilDoc {
  /** Top level only; a container's contents live in its `children`. */
  blocks: AnvilBlock[]
  /** True while the fence is still streaming: render, but never interactive. */
  partial: boolean
}

export function attrString(block: AnvilBlock, key: string, fallback = ''): string {
  const v = block.attrs[key]
  return typeof v === 'string' ? v : fallback
}

export function attrNumber(block: AnvilBlock, key: string, fallback: number): number {
  const v = block.attrs[key]
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : Number.NaN
  return Number.isFinite(n) ? n : fallback
}

export function galleryRender(block: AnvilBlock): GalleryRender {
  const v = attrString(block, 'render', 'image')
  return v === 'swatch' || v === 'type' || v === 'card' ? v : 'image'
}

export function isMulti(block: AnvilBlock): boolean {
  return attrString(block, 'select', 'one') === 'many'
}

const CHANNEL_SET = new Set<string>(MESSAGE_CHANNELS)

/** Unknown channels fall back to `memo` rather than borrowing someone else's chrome. */
export function messageChannel(block: AnvilBlock): MessageChannel {
  const v = attrString(block, 'channel', 'email').toLowerCase()
  return CHANNEL_SET.has(v) ? (v as MessageChannel) : 'memo'
}

/**
 * `to="a@x, b@y"` -> `['a@x', 'b@y']`.
 *
 * Split on commas AND semicolons, because both are real in the wild and an
 * agent copying an address list out of a mail client will produce either.
 */
export function recipients(block: AnvilBlock, key: string): string[] {
  return attrString(block, key)
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Every spelling of "no" an agent might reach for. Lowercased before lookup,
 * because `sent=No` -- the single most likely casing a model produces -- read
 * as SENT when this was two exact-string comparisons. A safety default that
 * one capital letter defeats is not a safety default.
 */
const NOT_SENT = new Set(['false', 'no', 'n', '0', 'off', 'never', ''])

/**
 * Has this message actually been sent?
 *
 * Defaults to NO, and that default is the safety property. A draft that renders
 * indistinguishably from a sent message is how a human scrolling back concludes
 * an email went out when it never did -- so `sent` must be asserted, never
 * assumed. See §4.15.1.
 */
export function isSent(block: AnvilBlock): boolean {
  const raw = block.attrs.sent
  if (raw === undefined) return false
  return !NOT_SENT.has(String(raw).trim().toLowerCase())
}

/**
 * The progress numbers for a card or board, COMPUTED FROM THE ROWS ON SCREEN.
 *
 * This is the reason @card exists as an ANVIL block rather than as an HTML
 * embed. An agent that writes "3/7" above nine subtasks is lying, and the
 * format should not give it the vocabulary to do so -- so there is no
 * `progress=` attribute to read here, only rows to count.
 *
 * A row may carry its own `n/m` (an epic listing stories, each with a count of
 * its own). If any row does, every row contributes its pair, and a bare row
 * counts as 1 of 1. Mixing the two is therefore still exact.
 */
export function taskProgress(block: AnvilBlock): AnvilProgress {
  const counts: Record<TaskState, number> = { todo: 0, flight: 0, done: 0, blocked: 0 }
  const rollup = block.tasks.some(t => t.total !== undefined)
  let done = 0
  let total = 0

  for (const t of block.tasks) {
    counts[t.state]++
    if (rollup) {
      done += t.done ?? (t.state === 'done' ? 1 : 0)
      total += t.total ?? 1
    } else {
      done += t.state === 'done' ? 1 : 0
      total += 1
    }
  }

  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0, counts, rollup }
}

/** The state the rows add up to. Nothing authored reaches this. */
export function countedStatus(block: AnvilBlock): TaskState {
  const p = taskProgress(block)
  if (p.total === 0) return 'todo'
  if (p.counts.blocked > 0 && p.counts.flight === 0 && p.done === 0) return 'blocked'
  if (p.done === 0) return 'todo'
  return p.done === p.total ? 'done' : 'flight'
}

const TASK_STATE_SET = new Set<string>(TASK_STATES)

/**
 * Does an authored `status=` contradict the rows underneath it?
 *
 * `blocked` is never a contradiction: a card can be blocked at any progress,
 * and that is a fact about the world the rows cannot know. Everything else is
 * a claim the rows can check.
 */
export function statusConflict(block: AnvilBlock): string | null {
  const authored = attrString(block, 'status').toLowerCase()
  if (!TASK_STATE_SET.has(authored) || authored === 'blocked') return null
  const p = taskProgress(block)
  if (p.total === 0) return null
  const counted = countedStatus(block)
  if (counted === authored || counted === 'blocked') return null
  return `status="${authored}" contradicts ${p.done}/${p.total}; using "${counted}"`
}

/**
 * A card's state.
 *
 * THE COUNT WINS. `status=` is allowed because a card can be blocked, or
 * authored before any rows exist -- but a `status=done` sitting above two open
 * subtasks is precisely the hand-typed claim §4.12.1 exists to make impossible,
 * so it loses to the rows and earns a warning at parse time.
 */
export function cardStatus(block: AnvilBlock): TaskState {
  const authored = attrString(block, 'status').toLowerCase()
  if (!TASK_STATE_SET.has(authored)) return countedStatus(block)
  return statusConflict(block) ? countedStatus(block) : (authored as TaskState)
}
