/**
 * Row parsers: the `-`, `_`, `%` and `+` lines. Split out of parse.ts so the
 * line loop there stays a thin dispatch and both files stay readable.
 *
 * Every function here is total: a malformed row records a warning on the block
 * and returns, never throws.
 */
import type { AnvilBlock, AnvilOption, FieldType, FlowShape, TaskState } from './types'
import { chartNumber, FIELD_TYPES, FLOW_SHAPES } from './types'

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
 * `- Label | 42 | note` -- one datum in a @chart.
 *
 * A row whose value cell is not a number is REFUSED, loudly, and not drawn.
 * Drawing it at zero would be worse than dropping it: zero is a claim, and a
 * bar of length nothing sitting under "Mon" says the Monday number was nought
 * rather than unreadable. Refusing it and naming the row is the only honest
 * option (§11 -- warned, never silent).
 */
export function parseDatum(rest: string, block: AnvilBlock): void {
  const parts = cells(rest)

  // A single numeric cell is a bare series point: `- 42`. Legal, unlabelled,
  // and what an agent writes when the x axis is just "in this order".
  if (parts.length === 1) {
    const only = parts[0] ?? ''
    const bare = chartNumber(only)
    if (bare !== null) {
      block.data.push({ label: '', value: bare, note: '', raw: only.trim() })
      return
    }
    block.warnings.push(`"${only}" has no value cell; write "- ${only} | 42"`)
    return
  }

  const [label = '', raw = '', note = ''] = parts
  const value = chartNumber(raw)
  if (value === null) {
    block.warnings.push(`"${label}" has no number in its value cell ("${raw}"); row not drawn`)
    return
  }
  block.data.push({ label, value, note, raw: raw.trim() })
}

/**
 * Split a flow row's first cell on its arrows.
 *
 * Hand-scanned rather than a split regex because the two arrow families need
 * different delimiting rules, and getting that wrong eats real ids. `->` is
 * unambiguous and needs no spaces; `--` is a HYPHEN AWAY from `dead-letter`, so
 * it only counts as an arrow when whitespace sits on both sides of it.
 *
 * A chain is one row: `- a -> b -> c` is two edges, because that is how anyone
 * writes a pipeline the first time.
 */
const DIRECTED = /^(-->|->|=>|→)/
const UNDIRECTED = /^\s(--|—)\s/

function splitArrows(s: string): { parts: string[]; undirected: boolean[] } {
  const parts: string[] = []
  const undirected: boolean[] = []
  let cur = ''
  let i = 0
  while (i < s.length) {
    const rest = s.slice(i)
    const dir = DIRECTED.exec(rest)
    if (dir) {
      parts.push(cur.trim())
      undirected.push(false)
      cur = ''
      i += (dir[0] ?? '').length
      continue
    }
    const und = UNDIRECTED.exec(rest)
    if (und) {
      parts.push(cur.trim())
      undirected.push(true)
      cur = ''
      i += (und[0] ?? '').length
      continue
    }
    cur += s[i]
    i++
  }
  parts.push(cur.trim())
  return { parts, undirected }
}

const SHAPE_SET = new Set<string>(FLOW_SHAPES)
const SHAPE_CELL = /^shape\s*=\s*(.*)$/i

/**
 * `- [x] id | Label | note` declares a node; `- a -> b | label` connects two.
 *
 * ONE SIGIL, and the arrow is what tells them apart -- the same trick §3.1 uses
 * for `-` in a @choice versus a @card, where the checkbox is the discriminator.
 * A second sigil for edges would be one more thing to remember in a language
 * whose whole argument is that there is almost nothing to remember.
 */
export function parseFlowRow(state: TaskState, boxed: boolean, rest: string, block: AnvilBlock): void {
  const parts = cells(rest)
  const head = parts.shift() ?? ''
  const { parts: hops, undirected } = splitArrows(head)

  if (hops.length > 1) {
    if (boxed) {
      // The box means "this step already has an answer", and an edge is not a
      // step. It belongs on the node row that declares one side of the arrow.
      block.warnings.push('a [ ] state on an edge row is ignored; put it on the node row instead')
    }
    const label = parts.find(c => !SHAPE_CELL.test(c)) ?? ''
    let made = 0
    for (let i = 0; i < hops.length - 1; i++) {
      const from = hops[i] ?? ''
      const to = hops[i + 1] ?? ''
      if (!from || !to) continue
      // `a -> a` ranks fine and draws as a loop on one node, but it is almost
      // always a copy-paste rather than a deliberate self-transition.
      if (from === to) {
        block.warnings.push(`"${from} -> ${to}" points at itself`)
        made++
        continue
      }
      // A chain shares one label across its segments. Repeating `on green` is
      // less surprising than silently attaching it to one hop of three.
      block.edges.push({ from, to, label, undirected: undirected[i] === true })
      made++
    }
    if (!made) block.warnings.push(`"${head}" is an arrow with nothing on one side of it`)
    return
  }

  if (!head) {
    block.warnings.push('flow row with no node id')
    return
  }

  let shape: FlowShape = 'box'
  const positional: string[] = []
  for (const cell of parts) {
    const m = SHAPE_CELL.exec(cell)
    if (!m) {
      positional.push(cell)
      continue
    }
    const want = (m[1] ?? '').trim().toLowerCase()
    if (SHAPE_SET.has(want)) shape = want as FlowShape
    else block.warnings.push(`unknown shape "${want}", drawn as a box. Known: ${FLOW_SHAPES.join(', ')}`)
  }

  block.nodes.push({
    id: head,
    label: positional[0] || head,
    note: positional[1] ?? '',
    state,
    shape,
    declared: true,
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
