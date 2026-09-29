/**
 * The ANVIL parser. Line-oriented, no lookahead.
 *
 * TOTAL BY CONTRACT: this function has no throw path. It parses agent-authored
 * text that arrives token by token, so every malformed shape degrades to
 * something renderable plus a warning. A throw here white-screens the whole
 * transcript, which is why parse.test.ts fuzzes every truncation of every
 * fixture.
 *
 * Row parsing lives in rows.ts; this file is the line dispatch and the block
 * assembly, nothing else.
 */
import {
  parseDatum,
  parseDial,
  parseField,
  parseFlowRow,
  parseMeta,
  parseOption,
  parseTask,
  TASK_BOX,
  taskState,
} from './rows'
import {
  ANVIL_KINDS,
  type AnvilBlock,
  type AnvilDoc,
  type AnvilKind,
  chartBetter,
  chartClip,
  chartNumber,
  chartRender,
  isContainer,
  MAX_FLOW_EDGES,
  MAX_FLOW_NODES,
  MAX_LAYOUT_DEPTH,
  recommendProblem,
  statusConflict,
} from './types'

const KIND_SET = new Set<string>(ANVIL_KINDS)
const DEFAULT_STEPS = 5
const HEADER = /^@(\w+)\s*(.*)$/
const ATTR = /([A-Za-z_][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g

/** A sigil-less line that opens with `key=` -- almost always a wrapped header. */
const WRAPPED_HEADER = /^[A-Za-z_][\w-]*=/

/** The kinds whose `-` rows are tasks rather than options. */
const TASK_KINDS = new Set<AnvilKind>(['card', 'board'])

/** The kinds that draw a `+` row. Everywhere else it would be parsed and dropped. */
const META_KINDS = new Set<AnvilKind>(['card', 'board', 'message', 'chart', 'flow'])

/** `key=value`, `key="quoted value"`, or a bare `key` meaning true. */
function parseAttrs(s: string): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {}
  for (const m of s.matchAll(ATTR)) {
    const key = m[1]
    if (!key) continue
    const val = m[2] ?? m[3] ?? m[4]
    attrs[key] = val === undefined ? true : val
  }
  return attrs
}

/** Stable, content-derived id. Must not depend on position: streaming reorders. */
function deriveId(kind: string, body: string): string {
  const norm = `${kind}\n${body.replace(/\s+/g, ' ').trim()}`
  let h = 0x811c9dc5
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `a${(h >>> 0).toString(16).padStart(8, '0')}`
}

function blank(kind: AnvilKind): AnvilBlock {
  return {
    kind,
    id: '',
    derivedId: true,
    prompt: '',
    subtext: '',
    attrs: {},
    options: [],
    fields: [],
    dials: [],
    tasks: [],
    data: [],
    nodes: [],
    edges: [],
    meta: [],
    children: [],
    prose: '',
    warnings: [],
  }
}

function join(prev: string, next: string, sep: string): string {
  return prev ? `${prev}${sep}${next}` : next
}

interface Cursor {
  block: AnvilBlock
  steps: number
  /** Containers are placed in the tree the moment they open, so close() must
   *  not place them a second time. */
  attached: boolean
}

/**
 * A `-` row means different things in different blocks, and the difference is
 * whether the row already has an answer. Rather than a second sigil, the
 * checkbox decides.
 */
function dashRow(rest: string, block: AnvilBlock): void {
  const wantsTasks = TASK_KINDS.has(block.kind)
  const boxed = TASK_BOX.exec(rest)
  const state = boxed ? taskState(boxed[1] ?? '') : null

  // A chart row is a magnitude, and a magnitude has no todo/done. A checkbox
  // here is an agent reaching for @card; the row still draws.
  if (block.kind === 'chart') {
    if (boxed) block.warnings.push(`[${boxed[1]}] state ignored: a @chart row is a value, not a task`)
    parseDatum(boxed ? (boxed[2] ?? '') : rest, block)
    return
  }

  // A flow row is a node or an edge, and the arrow decides which. The checkbox
  // means on a node exactly what it means on a card: this step has an answer.
  if (block.kind === 'flow') {
    if (boxed && !state) block.warnings.push(`unknown task state "[${boxed[1]}]", using todo`)
    parseFlowRow(state ?? 'todo', boxed !== null, boxed ? (boxed[2] ?? '') : rest, block)
    return
  }

  if (boxed && state) {
    if (wantsTasks) {
      parseTask(state, boxed[2] ?? '', block)
      return
    }
    // Visible, not silent: a checkbox on a @choice row is almost always an
    // agent reaching for @card, and the option still renders.
    block.warnings.push(`[${boxed[1]}] state ignored: only @card and @board have task rows`)
    parseOption(boxed[2] ?? '', block)
    return
  }

  if (boxed && !state) {
    block.warnings.push(`unknown task state "[${boxed[1]}]", using todo`)
    if (wantsTasks) {
      parseTask('todo', boxed[2] ?? '', block)
      return
    }
  }

  if (wantsTasks) {
    if (!boxed) block.warnings.push('task row with no [ ] state, using todo')
    parseTask('todo', boxed ? (boxed[2] ?? '') : rest, block)
    return
  }
  parseOption(rest, block)
}

/**
 * `>` is a note's prose everywhere except under a task row, where it is that
 * row's detail. Not a new sigil, because it is the same idea in both places:
 * the sentence attached to the thing above it.
 */
function proseRow(rest: string, block: AnvilBlock): void {
  const last = block.tasks[block.tasks.length - 1]
  if (last && TASK_KINDS.has(block.kind)) {
    last.detail = join(last.detail, rest, '\n')
    return
  }
  block.prose = join(block.prose, rest, '\n')
}

/**
 * Strategy map, not an if-else chain: one entry per sigil. A line whose first
 * character is not a key here folds into the prompt (see the fallback in run),
 * so a forgotten sigil renders slightly wrong instead of vanishing.
 */
const LINES: Record<string, (rest: string, cur: Cursor) => void> = {
  '?': (rest, { block }) => {
    block.prompt = join(block.prompt, rest, '\n')
  },
  ':': (rest, { block }) => {
    block.subtext = join(block.subtext, rest, ' ')
  },
  '>': (rest, { block }) => proseRow(rest, block),
  '-': (rest, { block }) => dashRow(rest, block),
  '+': (rest, { block }) => parseMeta(rest, block),
  _: (rest, { block }) => parseField(rest, block),
  '%': (rest, cur) => parseDial(rest, cur.block, cur.steps),
}

/**
 * Reads `steps=` off a freshly opened block, warning when out of range.
 *
 * The resolved value is written BACK onto the attribute. A renderer that
 * re-derives it from the raw string reaches a different number -- clamping
 * `steps=1` to 2 where the parser defaulted it to 5 -- and then places a knob
 * at `left: 300%`. One number, resolved once, in the file that owns it.
 */
function readSteps(block: AnvilBlock): number {
  const raw = block.attrs.steps
  if (typeof raw !== 'string') return DEFAULT_STEPS
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n) && n >= 2 && n <= 11) return n
  block.warnings.push(`steps="${raw}" out of range, using ${DEFAULT_STEPS}`)
  block.attrs.steps = String(DEFAULT_STEPS)
  return DEFAULT_STEPS
}

function unknownBlock(line: string, what: string): AnvilBlock {
  const block = blank('note')
  block.attrs.tone = 'warn'
  block.prose = line
  block.warnings.push(what)
  return block
}

function openBlock(line: string): Cursor {
  const m = HEADER.exec(line)
  const rawKind = (m?.[1] ?? '').toLowerCase()
  const known = KIND_SET.has(rawKind)
  const block = known ? blank(rawKind as AnvilKind) : unknownBlock(line, `unknown block "@${rawKind || '?'}"`)
  if (known) block.attrs = parseAttrs(m?.[2] ?? '')
  return { block, steps: readSteps(block), attached: false }
}

function finish(block: AnvilBlock, body: string[]): AnvilBlock {
  // `subject=` is an alias for the `?` line on a @message, because that is what
  // everyone reaches for first. The `?` line wins when both are present: it is
  // the one that is part of the language rather than a convenience.
  if (block.kind === 'message' && !block.prompt && typeof block.attrs.subject === 'string') {
    block.prompt = block.attrs.subject
  }

  // `values=3,5,4,9` is the one-line sparkline: a series with no labels, which
  // is what a trend actually is. Rows are the real grammar and win outright --
  // an agent that wrote both meant the rows, and the attribute is the shorthand
  // it forgot to delete.
  if (block.kind === 'chart' && typeof block.attrs.values === 'string') {
    if (block.data.length) {
      block.warnings.push('values= is ignored when the block has - rows; the rows are the data')
    } else {
      for (const raw of block.attrs.values.split(',')) {
        const cell = raw.trim()
        if (!cell) continue
        const n = chartNumber(cell)
        if (n === null) block.warnings.push(`values= entry "${cell}" is not a number; skipped`)
        else block.data.push({ label: '', value: n, note: '', raw: cell })
      }
    }
  }

  // An authored ceiling that would draw a bar shorter than its own printed
  // number is the chart version of a hand-typed progress count (§4.12.1).
  // A stat has no scale to clip, so it gets the louder complaint below instead.
  if (block.kind === 'chart') {
    const stat = chartRender(block) === 'stat'
    const clip = stat ? null : chartClip(block)
    if (clip) block.warnings.push(clip)

    // Parsed and then not drawn is the silent drop §11 forbids, in both
    // directions: a stat has no range for min/max/goal to move, and every
    // other mode has nowhere to print a change.
    if (stat) {
      const inert = ['min', 'max', 'goal'].filter(k => block.attrs[k] !== undefined)
      if (inert.length) {
        block.warnings.push(`${inert.map(k => `${k}=`).join(', ')} draw nothing on render=stat; a number has no scale`)
      }
    } else if (block.data.some(d => d.was !== undefined) || block.attrs.better !== undefined) {
      block.warnings.push('was= and better= are only drawn by render=stat')
    }
    if (block.attrs.better !== undefined && !chartBetter(block.attrs.better)) {
      block.warnings.push(`better="${String(block.attrs.better)}" is not up or down; changes are drawn without a verdict`)
    }
  }

  if (block.kind === 'flow') {
    const named = new Set<string>()
    for (const n of block.nodes) named.add(n.id)
    for (const e of block.edges) named.add(e.from), named.add(e.to)
    if (named.size > MAX_FLOW_NODES) {
      block.warnings.push(`${named.size} nodes is past the ${MAX_FLOW_NODES} a flow draws; the rest are not shown`)
    }
    if (block.edges.length > MAX_FLOW_EDGES) {
      block.warnings.push(`${block.edges.length} edges is past the ${MAX_FLOW_EDGES} a flow draws; the rest are not shown`)
    }
  }

  const authored = block.attrs.id
  if (typeof authored === 'string' && authored) {
    block.id = authored
    block.derivedId = false
  } else {
    block.id = deriveId(block.kind, body.join('\n'))
  }
  if (block.options.length > 12) {
    block.warnings.push(`${block.options.length} options is past the point a human scans; use @input`)
  }
  // An authored status that argues with the rows loses to them, loudly.
  if (block.kind === 'card') {
    const conflict = statusConflict(block)
    if (conflict) block.warnings.push(conflict)
  }
  const rec = recommendProblem(block)
  if (rec) block.warnings.push(rec)
  // Parsed-but-never-drawn is the silent drop §11 forbids.
  if (block.meta.length && !META_KINDS.has(block.kind)) {
    block.warnings.push(`+ rows are only drawn on @card, @board and @message, not @${block.kind}`)
  }
  if (block.prose && block.kind === 'board') {
    block.warnings.push('@board has no prose body; use a @note beside it')
  }
  return block
}

export function parseAnvil(source: string, opts: { partial?: boolean } = {}): AnvilDoc {
  const doc: AnvilDoc = { blocks: [], partial: opts.partial === true }

  /**
   * The open containers, innermost last. Never longer than MAX_LAYOUT_DEPTH.
   *
   * Containers opened past the cap are counted in `ghosts` instead of pushed.
   * They are provably always a suffix -- a real frame can never open above a
   * flattened one -- so an integer holds all the information a stack would, and
   * `@end` stays balanced by draining ghosts first. The array version made
   * `parseAnvil` quadratic: 60k `@grid` lines took 5.7 seconds and hung 60k
   * warning strings off one block, which white-screens a transcript just as
   * effectively as the throw the totality contract forbids.
   */
  const open: AnvilBlock[] = []
  let ghosts = 0
  /** One flatten warning per parent, however many containers it swallowed. */
  let warnedFlat = false

  let cur: Cursor | null = null
  let body: string[] = []

  /** Where a finished block goes: the innermost open container, else the doc. */
  const sink = (): AnvilBlock[] => open[open.length - 1]?.children ?? doc.blocks

  const close = (): void => {
    if (cur && !cur.attached) sink().push(finish(cur.block, body))
    cur = null
    body = []
  }

  const openContainer = (line: string): void => {
    const opened = openBlock(line)
    if (open.length >= MAX_LAYOUT_DEPTH) {
      // Flattened, not dropped: its children still render, one level shallower.
      ghosts++
      const parent = open[open.length - 1]
      if (parent && !warnedFlat) {
        parent.warnings.push(`layout nests ${MAX_LAYOUT_DEPTH} deep at most; deeper containers are flattened`)
        warnedFlat = true
      }
      return
    }
    if (opened.block.attrs.id) {
      opened.block.warnings.push('layout has no id: a @grid or @stack is never stamped, voided or targeted')
    }
    // A container has no identity: it is never stamped, never voided, never
    // referenced by a `for=`. An id here would imply it could be.
    opened.block.id = ''
    opened.block.derivedId = false
    opened.attached = true
    sink().push(opened.block)
    open.push(opened.block)
    // Stays the cursor so `? Title` on the next line titles the container
    // rather than opening an implicit note beside it.
    cur = opened
  }

  const closeContainer = (line: string): void => {
    close()
    if (ghosts > 0) {
      ghosts--
      return
    }
    if (open.length) {
      open.pop()
      warnedFlat = false
      return
    }
    sink().push(unknownBlock(line, 'stray @end with no open @grid or @stack'))
  }

  for (const rawLine of String(source ?? '').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    if (line.startsWith('@')) {
      const kind = (HEADER.exec(line)?.[1] ?? '').toLowerCase()
      if (kind === 'end') {
        closeContainer(line)
        continue
      }
      close()
      if (isContainer(kind)) openContainer(line)
      else cur = openBlock(line)
      continue
    }

    // Content before any @ header is an implicit note.
    if (!cur) cur = { block: blank('note'), steps: DEFAULT_STEPS, attached: false }
    body.push(line)

    const sigil = line.charAt(0)
    const handler = Object.hasOwn(LINES, sigil) ? LINES[sigil] : undefined

    // A container holds blocks and a `?` title, nothing else. Without this the
    // row is parsed into a field layoutShell never reads and disappears without
    // a trace -- the silent drop §11 forbids, in the same package whose board
    // renderer goes out of its way to print "+N more".
    if (isContainer(cur.block.kind) && sigil !== '?') {
      cur.block.warnings.push(`@${cur.block.kind} holds blocks, not "${sigil}" rows; this line is not drawn`)
      continue
    }

    if (handler) {
      handler(line.slice(1).trim(), cur)
      continue
    }

    // A block header is ONE LINE (§3.2). An agent with a long attribute list
    // will wrap it anyway, and the sigil-less fallback below then folds
    // `from="…" ask="…"` into the prompt -- so the block loses its attributes,
    // gains a line of machine text as its title, and says nothing about either.
    if (WRAPPED_HEADER.test(line)) {
      cur.block.warnings.push(`"${line.split(/\s+/)[0]}" looks like a wrapped @ header; keep attributes on one line`)
    }
    cur.block.prompt = join(cur.block.prompt, line, '\n')
  }

  // An unclosed container is not an error. A fence truncated mid-grid must
  // render what arrived, the same way an unclosed ~~~ closes at the fence.
  close()
  return doc
}
