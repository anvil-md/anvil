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
  | 'chart'
  | 'flow'
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
  'chart',
  'flow',
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

/* ── chart ───────────────────────────────────────────────────────────────── */

/** How a @chart draws its data. Closed, like every other render list. */
export type ChartRender = 'bar' | 'column' | 'line' | 'spark' | 'dot' | 'stat'

export const CHART_RENDERS: readonly ChartRender[] = ['bar', 'column', 'line', 'spark', 'dot', 'stat']

/** Which way a number has to move to be good news. Absent means nobody said. */
export type ChartBetter = 'up' | 'down'

export const CHART_BETTER: readonly ChartBetter[] = ['up', 'down']

/**
 * A `- Label | 42 | note` row.
 *
 * `raw` is kept beside the parsed number because the two say different things:
 * the number is what the bar is drawn from, and the raw is what the human wrote
 * and therefore what gets PRINTED. An agent writing `4.8k` gets `4.8k` back, not
 * `4800`, and the bar is still the right length.
 */
export interface AnvilDatum {
  label: string
  value: number
  /** Third cell: free text shown beside the value. */
  note: string
  /** The text the value was parsed out of. Always printed in preference to `value`. */
  raw: string
  /**
   * `was=` -- the value this one is compared with, and `wasRaw` the text it was
   * parsed from. The CHANGE is never authored: there is no `delta=`, for the
   * reason there is no `progress=` (§4.16.5).
   */
  was?: number
  wasRaw?: string
  /** Per-row `better=`, overriding the block's. */
  better?: ChartBetter
}

/**
 * The change from `was=` to the value, COMPUTED. The agent supplies two numbers
 * it read; the difference, the percentage and the verdict are arithmetic.
 */
export interface AnvilDelta {
  /** value - was, in the value's own units. */
  diff: number
  /** diff as a share of |was|, 0-100 scale. Null when was is zero: no base, no ratio. */
  pct: number | null
  direction: 'up' | 'down' | 'flat'
  /** Good or bad only when somebody said which way is better. Never guessed. */
  tone: 'good' | 'bad' | 'neutral'
}

/**
 * The range a chart is drawn against.
 *
 * THE RENDERER NEVER INVENTS A SCALE. The top is the largest datum unless an
 * author supplied a bigger one, the floor is zero unless something is negative,
 * and an authored bound that would CLIP a row loses to the row -- clipping is
 * how a bar chart tells the same lie a hand-typed `3/7` tells (§4.12.1), and it
 * is harder to spot because the number that is wrong was never written down.
 */
export interface AnvilDomain {
  /** Bottom of the drawn range. Zero, unless the data or `min=` moved it. */
  floor: number
  /** Top of the drawn range. The largest datum unless `max=` raised it. */
  top: number
  /** Where zero sits across the domain, 0-100. The baseline a bar grows from. */
  zeroPct: number
  /** True when `max=` set the top rather than the data. */
  authoredTop: boolean
  /**
   * True when `min=` lifted the floor off zero.
   *
   * A renderer MUST say so where the reader can see it. A truncated axis is
   * legitimate -- four uptimes between 99.2 and 99.99 are four identical bars
   * against a zero floor, which is a chart that has told you nothing -- but an
   * unlabelled one is the oldest deception in the subject.
   */
  authoredFloor: boolean
}

/* ── flow ────────────────────────────────────────────────────────────────── */

/** A node's outline. Three shapes carry every flow worth drawing in a sentence. */
export type FlowShape = 'box' | 'round' | 'diamond'

export const FLOW_SHAPES: readonly FlowShape[] = ['box', 'round', 'diamond']

/**
 * A `- [x] id | Label | note` row in a @flow.
 *
 * The checkbox is the SAME checkbox a @card task row carries, meaning the same
 * thing: this step already has an answer. A deploy pipeline drawn with two green
 * stages and one blocked one is the single most useful diagram an agent can put
 * in a transcript, and it costs no new vocabulary.
 */
export interface AnvilNode {
  id: string
  label: string
  /** Second line in the chip. */
  note: string
  state: TaskState
  shape: FlowShape
  /** False when the node was never declared, only named by an edge. */
  declared: boolean
}

/** A `- a -> b | label` row. `--` gives the undirected form. */
export interface AnvilEdge {
  from: string
  to: string
  label: string
  /** Written `--` rather than `->`: a relation with no direction. */
  undirected: boolean
}

/** An edge with the two facts the layout adds: which ranks it spans, and whether it goes backwards. */
export interface FlowEdge extends AnvilEdge {
  fromRank: number
  toRank: number
  /** True when this edge closes a cycle and was excluded from ranking. */
  back: boolean
}

export interface FlowLayout {
  /** Every node, declared or implied, after the cap. */
  nodes: AnvilNode[]
  /** Nodes grouped by rank, in draw order within each rank. */
  ranks: AnvilNode[][]
  edges: FlowEdge[]
  /** Nodes dropped by MAX_FLOW_NODES. Never silent -- the renderer says the count. */
  dropped: number
}

/**
 * How big a graph this draws before it stops being a sentence and starts being
 * a document. Past this it is an architecture diagram, and §4.14 L2 already drew
 * that line for layout.
 */
export const MAX_FLOW_NODES = 40

/**
 * And how many arrows between them.
 *
 * A separate cap because the node count does not bound it: forty nodes admit
 * sixteen hundred edges, and the ranking relaxation is O(nodes x edges). A fence
 * of sixty thousand `- a -> b` rows is the same shape of input that once made
 * `parseAnvil` quadratic on `@grid`, and the answer is the same -- bound it, and
 * say out loud what was not drawn.
 */
export const MAX_FLOW_EDGES = 120

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
  /** `- Label | 42` rows, for @chart. */
  data: AnvilDatum[]
  /** `- id | Label` rows, for @flow. Implied nodes are added by flowGraph, not here. */
  nodes: AnvilNode[]
  /** `- a -> b | label` rows, for @flow. */
  edges: AnvilEdge[]
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
 * Where a @message is in its life.
 *
 *   draft ──stamp──► approved ──host──► sent
 *     │                  │
 *     │                  └──host──► failed
 *     └──stamp──► declined
 *
 * The five exist because THE CLICK IS APPROVAL, NOT DELIVERY. A stamp records
 * that a human said yes at 14:04; whether the SMTP handoff succeeded is a
 * different fact, arriving later, from a different actor. Collapsing the two
 * would be the same lie as a draft that renders like a sent message -- the
 * failure §4.15.1 exists to prevent -- just three seconds further along.
 *
 * `sent`, `failed` and `declined` are ABSORBING, exactly like the stamp states
 * in §7.2. Nothing leaves them.
 */
export type MessageState = 'draft' | 'approved' | 'sent' | 'failed' | 'declined'

export const MESSAGE_STATES: readonly MessageState[] = ['draft', 'approved', 'sent', 'failed', 'declined']

const STATE_SET = new Set<string>(MESSAGE_STATES)

/** A message in one of these is frozen: no gate, no button, no second answer. */
const LOCKED = new Set<MessageState>(['approved', 'sent', 'failed', 'declined'])

export function isLocked(state: MessageState): boolean {
  return LOCKED.has(state)
}

/**
 * Every spelling of "no" an agent might reach for. Lowercased before lookup,
 * because `sent=No` -- the single most likely casing a model produces -- read
 * as SENT when this was two exact-string comparisons. A safety default that
 * one capital letter defeats is not a safety default.
 */
const NOT_SENT = new Set(['false', 'no', 'n', '0', 'off', 'never', ''])

/**
 * Where this message is.
 *
 * Defaults to `draft`, and that default is the safety property: a draft
 * rendering indistinguishably from a sent message is how a human scrolling
 * back concludes an email went out when it never did. Every state past `draft`
 * has to be ASSERTED (§4.15.1).
 *
 * `sent=<time>` is kept as sugar for `state=sent at=<time>`, because it is what
 * everyone writes first and it reads better than the long form.
 */
export function messageState(block: AnvilBlock): MessageState {
  const declared = attrString(block, 'state').trim().toLowerCase()
  if (STATE_SET.has(declared)) return declared as MessageState
  if (block.attrs.error !== undefined) return 'failed'

  const raw = block.attrs.sent
  if (raw !== undefined && !NOT_SENT.has(String(raw).trim().toLowerCase())) return 'sent'
  return 'draft'
}

/** When the message reached its current state, if the agent said. */
export function messageAt(block: AnvilBlock): string {
  const sugar = attrString(block, 'sent')
  const at = attrString(block, 'at') || (sugar && !NOT_SENT.has(sugar.toLowerCase()) ? sugar : '')
  return at === 'true' ? '' : at
}

/** True once the message can no longer be answered. */
export function isSent(block: AnvilBlock): boolean {
  return messageState(block) === 'sent'
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

/* ── recommend ───────────────────────────────────────────────────────────── */

/** The kinds with rows a human picks, and therefore a row an agent can recommend. */
const RECOMMENDABLE = new Set<AnvilKind>(['choice', 'gallery', 'card'])

/**
 * What is wrong with `recommend=`, or null when it names a row the human can pick.
 *
 * A recommendation that points at nothing is DROPPED WHOLE rather than guessed
 * at, the same rule every other agent-authored reference follows. Marking the
 * nearest match would put the agent's weight behind an option it never named.
 *
 * On a card it has to be an OPEN row, because only `[ ]` rows are pickable
 * (§4.12.4). Recommending a done subtask as "what next" is the lie that rule
 * exists to prevent, told with a highlight on it.
 */
export function recommendProblem(block: AnvilBlock): string | null {
  const raw = block.attrs.recommend
  if (raw === undefined) return null
  if (!RECOMMENDABLE.has(block.kind)) {
    return `recommend= has nothing to mark on @${block.kind}; only @choice, @gallery and an asking @card have rows to pick`
  }
  const want = typeof raw === 'string' ? raw.trim() : ''
  if (!want) return 'recommend= names no option; nothing is marked'

  if (block.kind === 'card') {
    if (!attrString(block, 'ask')) return 'recommend= needs ask=; a record has nothing to recommend'
    const row = block.tasks.find(t => t.ref === want)
    if (!row) return `recommend="${want}" names no row; nothing is marked`
    if (row.state !== 'todo') {
      return `recommend="${want}" is a ${row.state} row and only open rows can be picked; nothing is marked`
    }
    return null
  }

  return block.options.some(o => o.value === want) ? null : `recommend="${want}" names no option; nothing is marked`
}

/** The value of the row the agent would pick, or null. Never a row it did not name. */
export function recommended(block: AnvilBlock): string | null {
  const raw = block.attrs.recommend
  if (typeof raw !== 'string' || recommendProblem(block)) return null
  return raw.trim()
}

/* ── chart derivations ───────────────────────────────────────────────────── */

const CHART_RENDER_SET = new Set<string>(CHART_RENDERS)

/** Unknown modes fall back to `bar`, the one that survives any label length. */
export function chartRender(block: AnvilBlock): ChartRender {
  const v = attrString(block, 'render', 'bar').toLowerCase()
  return CHART_RENDER_SET.has(v) ? (v as ChartRender) : 'bar'
}

/**
 * `4.8k` -> 4800. `1,204` -> 1204. `-3.5%` -> -3.5. `lots` -> null.
 *
 * Deliberately narrow. A permissive number parser reaches into text it has no
 * business reading -- `24/12` is a date, `3/7` is a ratio, and either one
 * silently becoming a magnitude is exactly the failure rows.ts already fought
 * over in parseTask. Anything this does not recognise is REFUSED and warned
 * about, never guessed at.
 */
const NUMBER = /^([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([kmb])?\s*%?$/i
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

export function chartNumber(text: string): number | null {
  const t = String(text ?? '').trim()
  const m = NUMBER.exec(t)
  if (!m) return null
  const digits = `${m[2] ?? ''}`.replace(/,/g, '')
  const n = Number.parseFloat(`${digits}${m[3] ?? ''}`)
  if (!Number.isFinite(n)) return null
  const mult = m[4] ? (SCALE[m[4].toLowerCase()] ?? 1) : 1
  return (m[1] === '-' ? -1 : 1) * n * mult
}

/** An attribute that must be a number to mean anything. Absent and unparseable read alike. */
function numberAttr(block: AnvilBlock, key: string): number | null {
  const raw = block.attrs[key]
  return typeof raw === 'string' ? chartNumber(raw) : null
}

/** `better=up|down`, read loosely. Anything else is nobody saying, not a guess. */
export function chartBetter(raw: unknown): ChartBetter | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return v === 'up' || v === 'down' ? v : null
}

/**
 * The change a `render=stat` tile prints, or null when the row has no `was=`.
 *
 * The verdict is only ever the author's. "Failed +2" goes UP and is bad news;
 * "Signups +12" goes up and is good. The arithmetic knows the direction and
 * nothing else, so without `better=` the change is drawn neutral rather than
 * coloured by a guess about which way the agent meant.
 */
export function chartDelta(block: AnvilBlock, d: AnvilDatum): AnvilDelta | null {
  if (d.was === undefined) return null
  const diff = d.value - d.was
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  const better = d.better ?? chartBetter(block.attrs.better)
  const tone = direction === 'flat' || !better ? 'neutral' : direction === better ? 'good' : 'bad'
  return { diff, pct: d.was === 0 ? null : (diff / Math.abs(d.was)) * 100, direction, tone }
}

/**
 * A number with its unit. A WORD takes a space, a SYMBOL does not, and a single
 * letter is a magnitude rather than a word: `31 ms`, `4 GB`, `12%`, `4.8k`.
 * Spacing `k` like a unit produced `3.2 k`, which reads as three point two of
 * something.
 */
export function withUnit(text: string, unit: string): string {
  if (!unit) return text
  return /^[A-Za-z]{2,}/.test(unit) ? `${text} ${unit}` : `${text}${unit}`
}

/** `4.8k` -> `k`, `1,204` -> ``. The magnitude a raw value was written in. */
function rawScale(raw: string): string {
  return /([kmb])\s*%?$/i.exec(raw.trim())?.[1]?.toLowerCase() ?? ''
}

/** Digits after the point in the mantissa: `4.80k` -> 2. */
function rawDecimals(raw: string): number {
  return /\.(\d+)/.exec(raw)?.[1]?.length ?? 0
}

/**
 * `+6 · +18%`, `-0.7k · -15%`, `+2 pts`, `no change`.
 *
 * Printed in the units the agent WROTE, for the reason §4.16.1 prints `4.8k`
 * rather than `4800`: two values written in thousands differ in thousands, and
 * a float subtraction's `0.6999999` is not a number anybody typed. A value
 * that is already a percentage changes in POINTS, and gets no relative change
 * on top: `+2% (+20%)` is the sentence that makes people stop reading.
 */
export function deltaText(d: AnvilDatum, delta: AnvilDelta, unit = ''): string {
  if (delta.direction === 'flat') return 'no change'
  const was = d.wasRaw ?? String(d.was ?? '')
  const scale = rawScale(d.raw) === rawScale(was) ? rawScale(d.raw) : ''
  const div = scale ? (SCALE[scale] ?? 1) : 1
  const places = Math.max(rawDecimals(d.raw), rawDecimals(was))
  const sign = delta.diff > 0 ? '+' : '-'
  const grouped = d.raw.includes(',') || was.includes(',')
  const mag = Math.abs(delta.diff) / div
  const num = grouped
    ? mag.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })
    : mag.toFixed(places)

  const points = unit === '%' || /%\s*$/.test(d.raw) || /%\s*$/.test(was)
  if (points) return `${sign}${num}${scale} pts`

  const abs = withUnit(`${sign}${num}${scale}`, unit)
  if (delta.pct === null) return abs
  const p = Math.abs(delta.pct)
  const pct = p >= 10 ? Math.round(p).toString() : Number(p.toFixed(1)).toString()
  return pct === '0' ? abs : `${abs} · ${sign}${pct}%`
}

/** `goal=` draws a reference marker. It has to be inside the domain or it is not on screen. */
export function chartGoal(block: AnvilBlock): number | null {
  return numberAttr(block, 'goal')
}

/**
 * The range the bars are drawn against.
 *
 * One rule, applied three times: THE RANGE MUST CONTAIN EVERY VALUE IT DRAWS.
 *
 * 1. The floor defaults to zero, so a bar's LENGTH is its magnitude. A chart
 *    that quietly floors at its smallest datum makes 98 look twice 96, which is
 *    the oldest deception in the subject. Negative data lowers the floor to
 *    reach the data, never to flatter it.
 * 2. `min=` may lift the floor off zero, and the renderer must then SAY so.
 *    Four uptimes between 99.2 and 99.99 are four identical full-height bars
 *    against a zero floor -- a chart that has told the reader nothing. A
 *    truncated axis is legitimate; an unlabelled truncated axis is not.
 * 3. NEITHER BOUND MAY EXCLUDE A VALUE. `max=100` over a 99.4 is context;
 *    `max=50` over a 90 could only be drawn by clipping, which prints a number
 *    at the end of a bar too short to be that number. Same for a `min=` above
 *    the smallest datum. The data wins, and the parser has already said so.
 * 4. `goal=` extends the range if it sits outside, because a target you cannot
 *    see is not a target.
 *
 * `data` defaults to the block's rows and is overridable because a renderer that
 * caps a long series must scale the shape to WHAT IT DREW. Scaling the visible
 * tail against a peak that scrolled off the front draws a flat line under a
 * ceiling nothing reaches, which is the axis lying by omission.
 */
export function chartDomain(block: AnvilBlock, data: AnvilDatum[] = block.data): AnvilDomain {
  const values = data.map(d => d.value)
  const goal = chartGoal(block)
  if (goal !== null) values.push(goal)

  const { lowest, highest } = extent(values)

  const authoredMin = numberAttr(block, 'min')
  const authoredMax = numberAttr(block, 'max')

  // An authored bound is CLAMPED to the data rather than discarded. The agent
  // asking for `min=99.5` over a 99.21 wants a truncated axis and got the
  // arithmetic slightly wrong; answering that with a zero floor throws away the
  // intent as well as the number. So the bound moves just far enough to contain
  // every value -- the same thing `max=` does from the other end -- and the
  // parser says which number it actually used.
  const floor = authoredMin !== null ? Math.min(authoredMin, lowest) : Math.min(lowest, 0)
  let top = authoredMax !== null ? Math.max(authoredMax, highest) : highest
  // A flat series still needs a span, or every position divides by zero.
  if (top <= floor) top = floor + 1

  const span = top - floor
  const zeroPct = Math.min(100, Math.max(0, ((0 - floor) / span) * 100))
  // Both flags track WHERE THE RANGE ENDED UP, not whether the attribute was
  // taken verbatim. A clamped `min=` still truncates the axis and still has to
  // announce it; a `max=` that lost to the data set no scale worth mentioning.
  return {
    floor,
    top,
    zeroPct,
    authoredTop: authoredMax !== null && top > highest,
    authoredFloor: authoredMin !== null && floor !== 0,
  }
}

/**
 * Does an authored `max=` sit below the data it is supposed to contain?
 *
 * This is §4.12.1 arriving at a second block. A card cannot author its progress
 * because the rows would contradict it; a chart CAN author its ceiling, because
 * `max=100` over a 99.4 is real context nothing in the rows knows. What it must
 * not do is author a ceiling BELOW the data, because the only way to draw that
 * is to clip a bar -- and a bar drawn shorter than the number printed at the end
 * of it is a lie that nobody has to type out, which makes it worse than the one
 * @card was invented to stop.
 *
 * The data wins, exactly as the rows win over `status=`, and it says so.
 */
export function chartClip(block: AnvilBlock): string | null {
  if (!block.data.length) return null
  const { lowest, highest } = extent(block.data.map(d => d.value))

  const rawMax = block.attrs.max
  if (typeof rawMax === 'string') {
    const authored = chartNumber(rawMax)
    if (authored !== null && authored < highest) {
      return `max="${rawMax}" is below the largest value (${highest}); using ${highest} so nothing is clipped`
    }
  }

  const rawMin = block.attrs.min
  if (typeof rawMin === 'string') {
    const authored = chartNumber(rawMin)
    if (authored !== null && authored > lowest) {
      return `min="${rawMin}" is above the smallest value (${lowest}); using ${lowest} so nothing is clipped`
    }
  }

  return null
}

/**
 * Smallest and largest, by fold rather than by spread.
 *
 * `Math.max(...values)` passes every element as an ARGUMENT, and past some
 * engine-specific count that is a RangeError rather than a number. chartClip
 * runs INSIDE the parser, so the throw would come straight out of `parseAnvil`
 * -- the one thing parse.ts promises can never happen.
 *
 * The count is the reason this is a fold and not a bigger guard: measured
 * 2026-08-24, a 200k-row chart is fine in Bun 1.4 and dead in Node 22. A limit
 * that moves with the host is one this package cannot reason about, and every
 * consumer picks its own host. A fold has no argument limit at all, so the
 * question stops existing.
 */
function extent(values: number[]): { lowest: number; highest: number } {
  let lowest = Number.POSITIVE_INFINITY
  let highest = Number.NEGATIVE_INFINITY
  for (const v of values) {
    if (v < lowest) lowest = v
    if (v > highest) highest = v
  }
  return values.length ? { lowest, highest } : { lowest: 0, highest: 0 }
}

/** Where a value sits across the domain, 0-100. The one place the arithmetic lives. */
export function chartPct(domain: AnvilDomain, value: number): number {
  const span = domain.top - domain.floor
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((value - domain.floor) / span) * 100))
}

/* ── flow derivations ────────────────────────────────────────────────────── */

function impliedNode(id: string): AnvilNode {
  return { id, label: id, note: '', state: 'todo', shape: 'box', declared: false }
}

/**
 * Resolve the node set: everything declared, plus everything an edge names.
 *
 * An edge to an undeclared node is LEGAL and common -- `- build -> test` on its
 * own is the whole diagram most of the time, and forcing two declaration rows
 * first would make the useful case the verbose one. The implied node takes its
 * id as its label and `todo` as its state.
 */
function resolveNodes(block: AnvilBlock): Map<string, AnvilNode> {
  const byId = new Map<string, AnvilNode>()
  for (const n of block.nodes) {
    // A second declaration of the same id updates it rather than duplicating.
    byId.set(n.id, { ...(byId.get(n.id) ?? n), ...n })
  }
  for (const e of block.edges) {
    if (!byId.has(e.from)) byId.set(e.from, impliedNode(e.from))
    if (!byId.has(e.to)) byId.set(e.to, impliedNode(e.to))
  }
  return byId
}

/**
 * Which edges close a cycle, by DFS colouring. A grey target is a back edge.
 *
 * A cycle is not an error -- retry ladders and state machines have them, and
 * they are exactly what an agent wants to draw. It is only a problem for
 * RANKING, which is why the back edges are lifted out here and drawn afterwards
 * as returns rather than being dropped or, worse, sent into an infinite layout.
 */
function backEdges(nodes: Map<string, AnvilNode>, edges: AnvilEdge[]): Set<number> {
  const out = new Map<string, number[]>()
  edges.forEach((e, i) => {
    const list = out.get(e.from)
    if (list) list.push(i)
    else out.set(e.from, [i])
  })

  const back = new Set<number>()
  const colour = new Map<string, 0 | 1 | 2>()

  // Iterative, not recursive: a 40-node chain is fine either way, but a parser
  // that must never throw must also never blow a stack on agent-authored input.
  for (const start of nodes.keys()) {
    if (colour.get(start)) continue
    const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }]
    colour.set(start, 1)
    while (stack.length) {
      const frame = stack[stack.length - 1]
      if (!frame) break
      const outgoing = out.get(frame.id) ?? []
      if (frame.next >= outgoing.length) {
        colour.set(frame.id, 2)
        stack.pop()
        continue
      }
      const idx = outgoing[frame.next++] as number
      const to = (edges[idx] as AnvilEdge).to
      const seen = colour.get(to)
      if (seen === 1) {
        back.add(idx)
        continue
      }
      if (seen === 2) continue
      colour.set(to, 1)
      stack.push({ id: to, next: 0 })
    }
  }
  return back
}

/**
 * Longest-path layering, then one barycentre pass to settle the order inside
 * each rank.
 *
 * Longest path rather than shortest, so a node sits one column after its LAST
 * dependency: a step that waits on two things is drawn after both of them,
 * which is the thing a reader is looking for. The barycentre pass is one sweep,
 * stable, and broken to source order on ties -- deterministic output matters
 * more here than a perfect crossing count, because this string ends up in a
 * test.
 */
export function flowGraph(block: AnvilBlock): FlowLayout {
  const byId = resolveNodes(block)
  const dropped = Math.max(0, byId.size - MAX_FLOW_NODES)
  const kept = [...byId.values()].slice(0, MAX_FLOW_NODES)
  const live = new Set(kept.map(n => n.id))

  const edges = block.edges.filter(e => live.has(e.from) && live.has(e.to)).slice(0, MAX_FLOW_EDGES)
  const back = backEdges(new Map(kept.map(n => [n.id, n])), edges)

  const rank = new Map<string, number>(kept.map(n => [n.id, 0]))
  const forward = edges.filter((_, i) => !back.has(i))

  // Relax until stable. Bounded by the node count on a DAG, and the back edges
  // are already out, so this cannot spin.
  for (let pass = 0; pass < kept.length; pass++) {
    let moved = false
    for (const e of forward) {
      const want = (rank.get(e.from) ?? 0) + 1
      if (want > (rank.get(e.to) ?? 0)) {
        rank.set(e.to, want)
        moved = true
      }
    }
    if (!moved) break
  }

  const depth = kept.reduce((m, n) => Math.max(m, rank.get(n.id) ?? 0), 0)
  const ranks: AnvilNode[][] = Array.from({ length: depth + 1 }, () => [])
  const order = new Map<string, number>(kept.map((n, i) => [n.id, i]))
  for (const n of kept) (ranks[rank.get(n.id) ?? 0] as AnvilNode[]).push(n)

  const rowOf = new Map<string, number>()
  ranks.forEach(row => row.forEach((n, i) => rowOf.set(n.id, i)))
  for (let r = 1; r < ranks.length; r++) {
    const row = ranks[r] as AnvilNode[]
    const bary = new Map<string, number>()
    for (const n of row) {
      const parents = forward.filter(e => e.to === n.id).map(e => rowOf.get(e.from) ?? 0)
      bary.set(n.id, parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : Number.POSITIVE_INFINITY)
    }
    row.sort((a, b) => {
      const d = (bary.get(a.id) as number) - (bary.get(b.id) as number)
      return d !== 0 && Number.isFinite(d) ? d : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    })
    row.forEach((n, i) => rowOf.set(n.id, i))
  }

  return {
    nodes: kept,
    ranks,
    edges: edges.map((e, i) => ({
      ...e,
      fromRank: rank.get(e.from) ?? 0,
      toRank: rank.get(e.to) ?? 0,
      back: back.has(i),
    })),
    dropped,
  }
}
