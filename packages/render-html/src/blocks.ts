/**
 * Per-kind body renderers. Each takes a parsed block and returns an HTML
 * fragment; the shell in render.ts supplies the frame, prompt and footer.
 *
 * DISPLAY ONLY. Buttons, inputs and sliders render at full fidelity but carry
 * `disabled` -- this package draws a block, it does not run one. Stamping (the
 * answer half of the spec) is not implemented here.
 *
 * SECURITY: `swatch`, `font` and `img` come from agent-authored text and land
 * in style/src attributes, where escaping alone is not enough. They are
 * ALLOWLISTED (see safeColor / safeFont / safeUrl), not sanitised -- a value
 * that fails the allowlist is dropped rather than escaped.
 */
import {
  type AnvilBlock,
  type AnvilDatum,
  type AnvilDomain,
  type AnvilField,
  type AnvilKind,
  type AnvilNode,
  type AnvilOption,
  type AnvilTask,
  attrNumber,
  attrString,
  type ChartRender,
  chartDomain,
  chartGoal,
  chartPct,
  chartRender,
  type FieldType,
  type FlowEdge,
  flowGraph,
  type GalleryRender,
  galleryRender,
  isMulti,
  type MessageChannel,
  messageChannel,
  messageChrome,
  messageState,
  type NoteTone,
  recipients,
  type TaskState,
  taskProgress,
} from '@anvil-md/parser'
import { type IconName, icon, resolveIcon } from './icons'

/**
 * Look up an agent-authored key in a plain-object map.
 *
 * `MAP[key] ?? fallback` does NOT fall back for an inherited property, so
 * `gap=constructor` returned `function Object() { [native code] }` -- a legal
 * custom-property value, which then invalidated the whole track formula and
 * collapsed the grid to one column. Every map indexed by text an agent typed
 * goes through here.
 */
export function pick<T>(map: Record<string, T>, key: string, fallback: T): T {
  return Object.hasOwn(map, key) ? (map[key] as T) : fallback
}

export function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Hex only. Anything else is dropped rather than escaped into a style attr. */
function safeColor(c: string): string | null {
  return /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : null
}

/** Conservative family name: letters, digits, spaces, dashes. No quotes, no url(). */
function safeFont(f: string): string | null {
  const t = f.trim().replace(/^["']|["']$/g, '')
  return /^[\w][\w -]{0,48}$/.test(t) ? t : null
}

export function safeUrl(u: string): string | null {
  const t = u.trim()
  return /^https?:\/\/[^\s"'<>]+$/i.test(t) ? t : null
}

const MARK = '<span class="anvil-mark" aria-hidden="true"></span>'

function optionMeta(o: AnvilOption): string {
  return o.hint ? `<span class="anvil-hint">${esc(o.hint)}</span>` : ''
}

export function renderChoice(b: AnvilBlock): string {
  if (!b.options.length) return '<p class="anvil-empty">No options.</p>'
  const multi = isMulti(b)
  const rows = b.options
    .map((o, i) => {
      const danger = o.danger ? ' anvil-row-danger' : ''
      return `<button type="button" class="anvil-row${danger}" disabled>
        <span class="anvil-key">${multi ? MARK : esc(String(i + 1))}</span>
        <span class="anvil-row-main"><span class="anvil-label">${esc(o.label)}</span>${optionMeta(o)}</span>
      </button>`
    })
    .join('')
  return `<div class="anvil-rows" role="group">${rows}</div>`
}

/** One face per render mode. Strategy map: a new mode is one entry. */
const FACES: Record<GalleryRender, (o: AnvilOption) => string> = {
  swatch: o => {
    const chips = (o.swatch ?? [])
      .map(safeColor)
      .filter((c): c is string => c !== null)
      .map(c => `<i style="background:${c}"></i>`)
      .join('')
    return `<span class="anvil-swatch">${chips || '<i class="anvil-swatch-empty"></i>'}</span>`
  },
  type: o => {
    const fam = o.font ? safeFont(o.font) : null
    const style = fam ? ` style="font-family:'${fam}',serif"` : ''
    return `<span class="anvil-type"${style}>${esc(o.sample || 'Aa Bb Cc')}</span>`
  },
  image: o => {
    const url = o.img ? safeUrl(o.img) : null
    if (!url) return '<span class="anvil-img anvil-img-missing"></span>'
    return `<img class="anvil-img" src="${esc(url)}" alt="${esc(o.label)}" loading="lazy">`
  },
  card: () => '',
}

function cardFace(b: AnvilBlock, o: AnvilOption): string {
  return (FACES[galleryRender(b)] ?? FACES.card)(o)
}

export function renderGallery(b: AnvilBlock): string {
  if (!b.options.length) return '<p class="anvil-empty">No cards.</p>'
  const mode = galleryRender(b)
  const cards = b.options
    .map((o, i) => {
      const face = cardFace(b, o)
      return `<button type="button" class="anvil-card" disabled>
        ${face}
        <span class="anvil-card-foot">
          <span class="anvil-key">${esc(String(i + 1))}</span>
          <span class="anvil-label">${esc(o.label)}</span>
        </span>
        ${o.hint ? `<span class="anvil-hint">${esc(o.hint)}</span>` : ''}
      </button>`
    })
    .join('')
  // Same rule as @choice: single select locks on the click itself, so a submit
  // button would be a second, meaningless step.
  return `<div class="anvil-grid anvil-grid-${mode}">${cards}</div>`
}

function textControl(type: string, f: AnvilField): string {
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''
  return `<input class="anvil-input" type="${type}" disabled${ph}>`
}

/**
 * One control per field type. This was a ternary chain that collapsed every
 * type except `number` to a plain text input, so `secret` -- the one type whose
 * whole purpose is masking -- rendered its value in the clear, and `date`/`url`
 * silently lost their native controls.
 */
const CONTROLS: Record<FieldType, (f: AnvilField) => string> = {
  text: f => textControl('text', f),
  number: f => textControl('number', f),
  secret: f => textControl('password', f),
  url: f => textControl('url', f),
  date: f => textControl('date', f),
  path: f => textControl('text', f),
  longtext: f => {
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''
    return `<textarea class="anvil-input" rows="3" disabled${ph}></textarea>`
  },
  bool: () => '<span class="anvil-switch" aria-hidden="true"></span>',
}

const MONO_FIELDS = new Set<FieldType>(['path', 'url', 'secret'])

export function renderInput(b: AnvilBlock): string {
  if (!b.fields.length) return '<p class="anvil-empty">No fields.</p>'
  const rows = b.fields
    .map(f => {
      const opt = f.required ? '' : '<span class="anvil-optional">optional</span>'
      const control = (CONTROLS[f.type] ?? CONTROLS.text)(f)
      const mono = MONO_FIELDS.has(f.type) ? ' anvil-field-mono' : ''
      return `<div class="anvil-field${mono}">
        <label class="anvil-field-label">${esc(f.label)}${opt}</label>
        ${control}
      </div>`
    })
    .join('')
  return `<div class="anvil-fields">${rows}</div>`
}

export function renderScale(b: AnvilBlock): string {
  if (!b.dials.length) return '<p class="anvil-empty">No dials.</p>'
  // The parser already resolved `steps` and wrote it back, so this reads the
  // same number the dial values were clamped against. Re-deriving it here with
  // a different rule put the knob at `left: 300%` for `steps=1`: the parser
  // defaulted to 5 and clamped the value to 4, the renderer clamped to 2.
  const steps = Math.min(11, Math.max(2, attrNumber(b, 'steps', 5)))
  const rows = b.dials
    .map(d => {
      const raw = ((d.value - 1) / Math.max(1, steps - 1)) * 100
      const pct = Math.min(100, Math.max(0, raw))
      return `<div class="anvil-dial">
        <span class="anvil-pole">${esc(d.left)}</span>
        <span class="anvil-track"><i class="anvil-knob" style="left:${pct.toFixed(1)}%"></i></span>
        <span class="anvil-pole anvil-pole-right">${esc(d.right)}</span>
      </div>`
    })
    .join('')
  return `<div class="anvil-dials">${rows}</div>`
}

const NOTE_CLASS: Record<string, string> = {
  info: 'anvil-note-info',
  warn: 'anvil-note-warn',
  danger: 'anvil-note-danger',
}

const NOTE_ICON: Record<string, IconName> = {
  info: 'info',
  warn: 'triangle-alert',
  danger: 'octagon-alert',
}

/** Non-fatal parse complaints. Always rendered next to what they describe. */
export function warnings(b: AnvilBlock): string {
  if (!b.warnings.length) return ''
  return `<div class="anvil-warn">${b.warnings.map(w => esc(w)).join(' · ')}</div>`
}

export function renderNote(b: AnvilBlock): string {
  const tone = attrString(b, 'tone', 'info')
  const cls = pick(NOTE_CLASS, tone, NOTE_CLASS.info)
  const text = b.prose || b.prompt
  if (!text) return ''
  const paras = text
    .split('\n')
    .filter(Boolean)
    .map(l => `<p>${esc(l)}</p>`)
    .join('')
  const mark = icon(resolveIcon(b.attrs.icon, pick(NOTE_ICON, tone, 'info')))
  // A note carries its own warnings INSIDE the tinted box. The shell cannot
  // append them, because a note has no frame to append them to and they would
  // float naked in the transcript.
  return `<div class="anvil-note ${cls}"><span class="anvil-icon">${mark}</span><div class="anvil-note-body">${paras}${warnings(b)}</div></div>`
}

/* ── card and board ──────────────────────────────────────────────────────── */

export const STATE_ICON: Record<TaskState, IconName> = {
  todo: 'circle',
  flight: 'circle-dot',
  done: 'circle-check',
  blocked: 'ban',
}

export const STATE_LABEL: Record<TaskState, string> = {
  todo: 'Todo',
  flight: 'In flight',
  done: 'Done',
  blocked: 'Blocked',
}

/** Lane order on a board. Blocked trails because it is usually empty. */
const LANE_ORDER: readonly TaskState[] = ['todo', 'flight', 'done', 'blocked']

/** A DOM id built from agent-authored text. Anything outside the allowlist goes. */
function slugId(s: string): string {
  const t = String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '-')
  return t || 'anvil'
}

function pctWidth(done: number, total: number): string {
  if (total <= 0) return '0'
  return ((Math.min(done, total) / total) * 100).toFixed(1)
}

/**
 * The bar. Its numbers arrive already counted (taskProgress), never read off an
 * attribute -- see §4.12.1.
 *
 * `role="progressbar"` with `aria-valuetext`, so it announces "1 of 3 done"
 * rather than "33 percent". (An earlier comment here claimed a progressbar
 * cannot carry the ratio; that is false -- `aria-valuetext` exists precisely
 * for this, and `role="img"` threw away the semantic for nothing.)
 *
 * `label` is a parameter rather than a template, because the same bar means two
 * different things: on a card it is how much is DONE, on a board lane it is how
 * much of the sprint sits in that lane. Announcing a todo lane as "3 of 5 done"
 * is a straightforward lie to anyone who cannot see the colour.
 */
function bar(value: number, total: number, label: string, extra = ''): string {
  const now = Math.min(value, total)
  return `<span class="anvil-bar${extra}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${now}" aria-valuetext="${esc(label)}"><i style="width:${pctWidth(value, total)}%"></i></span>`
}

function taskRowInner(t: AnvilTask): string {
  const glyph = `<span class="anvil-task-glyph" data-state="${t.state}">${icon(STATE_ICON[t.state])}</span>`
  const ref = t.ref === t.label ? '' : `<span class="anvil-task-ref">${esc(t.ref)}</span>`
  const label = `<span class="anvil-task-label">${esc(t.label)}</span>`
  // A child that carries its own n/m draws its own bar. An epic is a card whose
  // rows happen to be cards.
  const meta =
    t.total !== undefined && t.done !== undefined
      ? `<span class="anvil-task-roll">${bar(t.done, t.total, `${t.done} of ${t.total} done`, ' anvil-bar-mini')}<span class="anvil-count">${t.done}/${t.total}</span></span>`
      : t.meta
        ? `<span class="anvil-task-meta">${esc(t.meta)}</span>`
        : ''
  return `${glyph}${ref}${label}${meta}`
}

/**
 * One subtask row.
 *
 * The detail is ALWAYS in the DOM and always wired up with aria-describedby;
 * CSS only decides whether it is painted. Hover-only detail is the same
 * accessibility failure as drag-only ranking in §4.9 -- it does not exist on a
 * keyboard and it does not exist on a phone -- so the row is focusable and the
 * reveal fires on hover, focus and focus-within alike.
 */
function taskRow(b: AnvilBlock, t: AnvilTask, i: number, pickIndex: number | null): string {
  const detailId = `${slugId(b.id)}-t${i}`
  const hasDetail = t.detail.trim().length > 0
  // One wrapper child, because the collapse is `grid-template-rows: 0fr -> 1fr`
  // and that only collapses a single row.
  const detail = hasDetail
    ? `<span class="anvil-task-detail" id="${detailId}" role="note"><span class="anvil-task-detail-in">${t.detail
        .split('\n')
        .filter(Boolean)
        .map(l => `<span class="anvil-task-detail-line">${esc(l)}</span>`)
        .join('')}</span></span>`
    : ''

  const inner = taskRowInner(t)
  // The pick marker gets its own shape. Reusing a state glyph would put "you
  // chose this" and "this is not done" in the same row wearing the same
  // vocabulary, and nothing in the source would tell them apart on re-read.
  const body =
    pickIndex === null
      ? `<span class="anvil-task-main">${inner}</span>`
      : `<button type="button" class="anvil-task-main anvil-task-pick" disabled><span class="anvil-key anvil-pick-key">${pickIndex}</span>${inner}</button>`

  const attrs = hasDetail ? ` tabindex="0" aria-describedby="${detailId}"` : ''
  const cls = `anvil-task${hasDetail ? ' anvil-task-detailed' : ''}${pickIndex === null ? '' : ' anvil-task-pickable'}`
  return `<li class="${cls}" data-state="${t.state}"${attrs}>${body}${detail}</li>`
}

/**
 * `ask=` is the one thing that turns a card from a record into a question.
 * Only todo rows are pickable: offering a done or blocked subtask as "what
 * next" is a lie about what the human can actually choose.
 */
function askable(b: AnvilBlock): boolean {
  return attrString(b, 'ask').length > 0
}

export function renderTasks(b: AnvilBlock): string {
  if (!b.tasks.length) return '<p class="anvil-empty">No subtasks.</p>'
  const asking = askable(b)
  let pick = 0
  const rows = b.tasks
    .map((t, i) => taskRow(b, t, i, asking && t.state === 'todo' ? ++pick : null))
    .join('')
  return `<ul class="anvil-tasks">${rows}</ul>`
}

export function renderProgress(b: AnvilBlock): string {
  const p = taskProgress(b)
  if (p.total === 0) return ''
  return `<div class="anvil-progress">${bar(p.done, p.total, `${p.done} of ${p.total} done`)}<span class="anvil-count">${p.done}/${p.total} · ${p.pct}%</span></div>`
}

/** The `✓ done 12   ◐ flight 6 …` strip. Counts, so it cannot disagree with the rows. */
export function renderTally(b: AnvilBlock): string {
  const { counts } = taskProgress(b)
  const cells = LANE_ORDER.filter(s => counts[s] > 0)
    .map(
      s =>
        `<span class="anvil-tally-cell" data-state="${s}">${icon(STATE_ICON[s])}<span>${STATE_LABEL[s].toLowerCase()}</span><b>${counts[s]}</b></span>`,
    )
    .join('')
  return cells ? `<div class="anvil-tally">${cells}</div>` : ''
}

/**
 * A card's `+` rows: every cell is its own chip, whatever line it came from.
 * A leading `!` marks one urgent -- one grammar character, because `high`
 * otherwise renders identically to `Sprint 24` and priority is the one chip
 * anybody actually scans for.
 */
export function renderChips(b: AnvilBlock): string {
  const chips = b.meta.flat()
  if (!chips.length) return ''
  const items = chips
    .map(c => {
      const urgent = c.startsWith('!')
      const text = urgent ? c.slice(1).trim() : c
      return `<li${urgent ? ' class="anvil-chip-urgent"' : ''}>${esc(text)}</li>`
    })
    .join('')
  return `<ul class="anvil-chips">${items}</ul>`
}

/**
 * Card-level prose: `>` lines written BEFORE the first task row.
 *
 * It was parsed and then never drawn, which is the silent drop §11 forbids.
 * The ordering is the whole rule: before the rows it belongs to the card,
 * after them it belongs to the row above it (§4.12.3).
 */
export function cardProse(b: AnvilBlock): string {
  if (!b.prose.trim()) return ''
  const paras = b.prose
    .split('\n')
    .filter(Boolean)
    .map(l => `<p>${esc(l)}</p>`)
    .join('')
  return `<div class="anvil-card-prose">${paras}</div>`
}

export function renderCard(b: AnvilBlock): string {
  const ask = attrString(b, 'ask')
  const head = ask
    ? `<div class="anvil-prompt anvil-card-ask"><span class="anvil-icon">${icon('list-checks')}</span>${esc(ask)}</div>`
    : ''
  const tally = b.tasks.some(t => t.total !== undefined) ? renderTally(b) : ''
  return `${renderProgress(b)}${tally}${cardProse(b)}${head}${renderTasks(b)}${renderChips(b)}`
}

/**
 * A board is a card seen sideways: the same task rows, grouped by the state
 * they already carry. Lanes are DERIVED, so a board cannot claim a lane count
 * that disagrees with the cards sitting in it.
 */
export function renderBoard(b: AnvilBlock): string {
  if (!b.tasks.length) return '<p class="anvil-empty">No cards.</p>'
  const cap = Math.max(1, Math.min(50, attrNumber(b, 'max', 4)))
  const total = b.tasks.length
  const lanes = LANE_ORDER.map(state => ({ state, items: b.tasks.filter(t => t.state === state) })).filter(
    l => l.items.length > 0,
  )

  const cols = lanes
    .map(l => {
      const shown = l.items.slice(0, cap)
      const hidden = l.items.length - shown.length
      const items = shown
        .map(t => {
          const ref = t.ref === t.label ? '' : `<span class="anvil-task-ref">${esc(t.ref)}</span>`
          return `<li class="anvil-lane-item">${ref}<span class="anvil-task-label">${esc(t.label)}</span></li>`
        })
        .join('')
      // "+N more" is never silent: a board that quietly truncates reads as a
      // complete board, which is the same lie as an authored progress number.
      const more = hidden > 0 ? `<p class="anvil-more">+${hidden} more</p>` : ''
      return `<section class="anvil-lane" data-state="${l.state}">
        <header class="anvil-lane-head"><span class="anvil-icon">${icon(STATE_ICON[l.state])}</span><span class="anvil-lane-name">${STATE_LABEL[l.state]}</span><span class="anvil-lane-count">${l.items.length}</span></header>
        ${bar(l.items.length, total, `${l.items.length} of ${total} cards ${STATE_LABEL[l.state].toLowerCase()}`, ' anvil-bar-lane')}
        <ul class="anvil-lane-items">${items}</ul>${more}
      </section>`
    })
    .join('')

  return `<div class="anvil-lanes anvil-auto" style="--anvil-cols:${lanes.length};--anvil-min:9rem">${cols}</div>${renderChips(b)}`
}

/* ── chart ───────────────────────────────────────────────────────────────── */

/**
 * How many rows a bar, column or dot chart draws before it stops being a shape
 * you read in one glance. `line` and `spark` are uncapped: a long series is the
 * entire point of them.
 */
const CHART_ROW_CAP = 24

/**
 * And how long a series a line draws.
 *
 * Uncapped, a fence of sixty thousand `- x | 1` rows produces a `points`
 * attribute most of a megabyte long and a hidden list of sixty thousand `<li>`,
 * which wedges the transcript just as thoroughly as the throw the parser is
 * forbidden from making. Higher than the row cap because a long series is what
 * `line` is FOR; bounded because nothing here may be unbounded.
 */
const CHART_SERIES_CAP = 400

/**
 * The printed number.
 *
 * `raw` in preference to `value`, always: an agent that wrote `4.8k` gets
 * `4.8k` back rather than `4800`. THE NUMBER IS NEVER ONLY IN THE PIXELS -- a
 * bar you cannot read the value off is a picture of data rather than data, and
 * it is unreadable to anyone using a screen reader.
 */
function valueText(d: AnvilDatum, unit: string): string {
  const raw = d.raw || String(d.value)
  if (!unit) return raw
  // A WORD takes a space, a SYMBOL does not, and a single letter is a
  // magnitude rather than a word: `31 ms`, `4 GB`, `12%`, `4.8k`. Spacing `k`
  // like a unit produced `3.2 k`, which reads as three point two of something.
  return /^[A-Za-z]{2,}/.test(unit) ? `${raw} ${unit}` : `${raw}${unit}`
}

/** Start and length of a bar, as a share of the domain, measured from zero. */
function span(domain: AnvilDomain, value: number): { start: number; size: number; negative: boolean } {
  const pos = chartPct(domain, value)
  const zero = domain.zeroPct
  return { start: Math.min(pos, zero), size: Math.abs(pos - zero), negative: value < 0 }
}

/**
 * The reference marker, drawn INSIDE every track rather than as one rule across
 * the plot. A single overlay would have to be positioned against a box that
 * also contains the labels, and the gaps between tracks turn the repeat into a
 * dashed line for free.
 */
function goalMark(goal: number | null, domain: AnvilDomain, axis: 'left' | 'bottom'): string {
  if (goal === null) return ''
  return `<b class="anvil-chart-goal" style="${axis}:${chartPct(domain, goal).toFixed(2)}%"></b>`
}

/**
 * Rows past the cap are COUNTED, never quietly dropped -- the same rule a board
 * lane follows, for the same reason: a truncated chart reads as a whole one.
 */
function more(hidden: number): string {
  return hidden > 0 ? `<p class="anvil-more">+${hidden} more</p>` : ''
}

/**
 * What actually gets drawn, and how much did not.
 *
 * The two families truncate from opposite ends and that is deliberate. A bar
 * chart is a ranked list, so the FIRST rows are the ones the agent put first. A
 * line is a history, so the LAST points are the recent end anybody is reading
 * the trend for -- and keeping the tail is also what makes the printed "last"
 * value the actual last value.
 *
 * The domain is computed from THIS array rather than from every row, because a
 * shape scaled against a peak that is not on screen draws a flat line under a
 * ceiling nothing reaches.
 */
interface Visible {
  data: AnvilDatum[]
  /** Rows cut off the front, for a series. */
  before: number
  /** Rows cut off the back, for a list. */
  after: number
}

function visible(b: AnvilBlock, mode: ChartRender): Visible {
  if (mode === 'line' || mode === 'spark') {
    const before = Math.max(0, b.data.length - CHART_SERIES_CAP)
    return { data: before ? b.data.slice(before) : b.data, before, after: 0 }
  }
  const after = Math.max(0, b.data.length - CHART_ROW_CAP)
  return { data: after ? b.data.slice(0, CHART_ROW_CAP) : b.data, before: 0, after }
}

function renderBars(v: Visible, domain: AnvilDomain, goal: number | null, unit: string, dots: boolean): string {
  const rows = v.data
    .map(d => {
      const { start, size, negative } = span(domain, d.value)
      // A dot plot marks the value and draws no ink between it and zero. Same
      // arithmetic, one CSS class apart.
      const fill = dots
        ? `<i class="anvil-chart-dot" style="left:${chartPct(domain, d.value).toFixed(2)}%"></i>`
        : `<i style="left:${start.toFixed(2)}%;width:${size.toFixed(2)}%"></i>`
      const note = d.note ? `<span class="anvil-chart-note">${esc(d.note)}</span>` : ''
      return `<li class="anvil-chart-row${negative ? ' anvil-chart-neg' : ''}">
        <span class="anvil-chart-label">${esc(d.label)}</span>
        <span class="anvil-chart-track" aria-hidden="true">${fill}${goalMark(goal, domain, 'left')}</span>
        <span class="anvil-chart-value">${esc(valueText(d, unit))}${note}</span>
      </li>`
    })
    .join('')
  return `<ul class="anvil-chart-rows">${rows}</ul>${more(v.after)}`
}

function renderColumns(v: Visible, domain: AnvilDomain, goal: number | null, unit: string): string {
  const cols = v.data
    .map(d => {
      const { start, size, negative } = span(domain, d.value)
      return `<li class="anvil-chart-col${negative ? ' anvil-chart-neg' : ''}">
        <span class="anvil-chart-value">${esc(valueText(d, unit))}</span>
        <span class="anvil-chart-stem" aria-hidden="true"><i style="bottom:${start.toFixed(2)}%;height:${size.toFixed(2)}%"></i>${goalMark(goal, domain, 'bottom')}</span>
        <span class="anvil-chart-label">${esc(d.label)}</span>
      </li>`
    })
    .join('')
  return `<ol class="anvil-chart-cols">${cols}</ol>${more(v.after)}`
}

/**
 * The series, in text, for anyone not looking at the picture.
 *
 * A line of thirty points cannot print thirty numbers without becoming a table,
 * so the visible chart prints the ends and the extremes and this carries the
 * rest. Visually hidden, never `display:none`: the second one is not in the
 * accessibility tree either, which would make the whole block a shape with no
 * data in it.
 */
function seriesText(data: AnvilDatum[], unit: string): string {
  const items = data.map((d, i) => `<li>${esc(d.label || `Point ${i + 1}`)}: ${esc(valueText(d, unit))}</li>`).join('')
  return `<ul class="anvil-sr">${items}</ul>`
}

/**
 * A polyline over a 0-100 box.
 *
 * `preserveAspectRatio="none"` so the shape fills whatever width the transcript
 * gives it, and `vector-effect="non-scaling-stroke"` so the line keeps its
 * weight while that happens. Without the second one a wide sparkline draws a
 * hairline and a narrow one draws a slab.
 */
function polyline(data: AnvilDatum[], domain: AnvilDomain, goal: number | null, area: boolean): string {
  const n = data.length
  const xs = (i: number): number => (n > 1 ? (i / (n - 1)) * 100 : 50)
  const ys = (v: number): number => 100 - chartPct(domain, v)
  const pts = data.map((d, i) => `${xs(i).toFixed(2)},${ys(d.value).toFixed(2)}`).join(' ')

  const fill = area && n > 1 ? `<polygon class="anvil-spark-area" points="0,100 ${pts} 100,100"></polygon>` : ''
  const rule =
    goal === null
      ? ''
      : `<line class="anvil-spark-goal" x1="0" x2="100" y1="${ys(goal).toFixed(2)}" y2="${ys(goal).toFixed(2)}" vector-effect="non-scaling-stroke"></line>`
  const last = n ? `<circle class="anvil-spark-last" cx="${xs(n - 1).toFixed(2)}" cy="${ys((data[n - 1] as AnvilDatum).value).toFixed(2)}" r="2.5"></circle>` : ''

  return `<svg class="anvil-spark-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    ${fill}${rule}<polyline class="anvil-spark-line" points="${pts}" vector-effect="non-scaling-stroke"></polyline>${last}
  </svg>`
}

/** First, last and the two extremes. The four numbers a trend is actually read for. */
function seriesSummary(data: AnvilDatum[], unit: string): string {
  if (!data.length) return ''
  const first = data[0] as AnvilDatum
  const last = data[data.length - 1] as AnvilDatum
  const lowest = data.reduce((a, d) => (d.value < a.value ? d : a), first)
  const highest = data.reduce((a, d) => (d.value > a.value ? d : a), first)
  const cell = (name: string, d: AnvilDatum): string =>
    `<span class="anvil-chart-stat"><span>${name}</span><b>${esc(valueText(d, unit))}</b>${d.label ? `<i>${esc(d.label)}</i>` : ''}</span>`
  return `<div class="anvil-chart-stats">${cell('first', first)}${cell('last', last)}${cell('low', lowest)}${cell('high', highest)}</div>`
}

function renderLine(v: Visible, domain: AnvilDomain, goal: number | null, unit: string, spark: boolean): string {
  const earlier = v.before > 0 ? `<p class="anvil-more">+${v.before} earlier</p>` : ''
  const chart = `<div class="anvil-spark${spark ? ' anvil-spark-tiny' : ''}">${polyline(v.data, domain, goal, !spark)}</div>`
  if (spark) {
    const last = v.data[v.data.length - 1] as AnvilDatum | undefined
    const now = last ? `<span class="anvil-chart-value">${esc(valueText(last, unit))}</span>` : ''
    return `<div class="anvil-spark-line-row">${chart}${now}</div>${seriesText(v.data, unit)}${earlier}`
  }
  return `${chart}${seriesSummary(v.data, unit)}${seriesText(v.data, unit)}${earlier}`
}

/** One entry per render mode. A sixth mode is one line here plus one renderer. */
const CHART_MODES: Record<ChartRender, (v: Visible, d: AnvilDomain, g: number | null, u: string) => string> = {
  bar: (v, d, g, u) => renderBars(v, d, g, u, false),
  dot: (v, d, g, u) => renderBars(v, d, g, u, true),
  column: renderColumns,
  line: (v, d, g, u) => renderLine(v, d, g, u, false),
  spark: (v, d, g, u) => renderLine(v, d, g, u, true),
}

export function renderChart(b: AnvilBlock): string {
  if (!b.data.length) return '<p class="anvil-empty">No data.</p>'
  const mode = chartRender(b)
  const v = visible(b, mode)
  const domain = chartDomain(b, v.data)
  const goal = chartGoal(b)
  const unit = attrString(b, 'unit')
  const body = (CHART_MODES[mode] ?? CHART_MODES.bar)(v, domain, goal, unit)
  // AN AXIS THAT IS NOT WHAT A READER ASSUMES MUST SAY SO. A bar chart is read
  // as "length is magnitude", and both of these break that read: a raised floor
  // means the bars are differences rather than amounts, and an authored ceiling
  // means the longest bar is not the maximum. Neither is dishonest labelled;
  // both are dishonest silent, and the truncated floor is the one that has been
  // fooling people since printed newspapers.
  const parts = [
    domain.authoredFloor ? `scale from ${esc(String(domain.floor))}${esc(unit)}, not zero` : '',
    domain.authoredTop ? `to ${esc(String(domain.top))}${esc(unit)}` : '',
    goal !== null ? `goal ${esc(String(goal))}${esc(unit)}` : '',
  ].filter(Boolean)
  const scale = parts.length ? `<p class="anvil-chart-scale">${parts.join(' · ')}</p>` : ''
  const truncated = domain.authoredFloor ? ' anvil-chart-truncated' : ''
  return `<div class="anvil-chart${truncated}" data-render="${esc(mode)}">${body}${scale}</div>${renderChips(b)}`
}

/* ── flow ────────────────────────────────────────────────────────────────── */

/**
 * Type metrics, estimated rather than measured.
 *
 * This renderer emits a STRING. There is no DOM to measure against, no layout
 * pass to wait for, and there must never be -- so the node boxes are sized from
 * a character count against a monospace advance, which is exactly what an ASCII
 * diagram does and is exact for the font stack the CSS pins. Generous padding
 * absorbs the error; `<title>` carries any label the box had to cut.
 */
const FONT_PX = 12
const CHAR_PX = 7.1
const PAD_X = 12
const NODE_MIN_W = 68
const NODE_MAX_CHARS = 26
const EDGE_MAX_CHARS = 20
const ROW_H = 17
const GUTTER_MIN = 46
const GAP = 16
const LANE = 26

/** The widest edge label, in pixels, once clipping has had its say. */
function widestLabel(edges: FlowEdge[]): number {
  const chars = edges.reduce((m, e) => Math.max(m, clip(e.label, EDGE_MAX_CHARS).length), 0)
  return chars ? chars * CHAR_PX + 10 : 0
}

/**
 * The gutter has to fit the labels that sit in it, ALONG THE AXIS IT RUNS.
 *
 * A fixed gutter drew `still failing` as a 102px pill across a 46px gap, so the
 * label lay on top of the two boxes it described. Sizing every gutter by label
 * WIDTH then overcorrected the other way: a `dir=down` gutter runs vertically,
 * a label crossing it is 16px tall however many characters it has, and
 * `re-request` opened a 150px canyon between two ranks. Width for a rightward
 * flow, height for a downward one.
 */
function gutterFor(edges: FlowEdge[], down: boolean): number {
  if (down) return GUTTER_MIN
  const widest = widestLabel(edges)
  return widest ? Math.max(GUTTER_MIN, widest + 12) : GUTTER_MIN
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

interface Placed {
  node: AnvilNode
  x: number
  y: number
  w: number
  h: number
}

function nodeWidth(n: AnvilNode): number {
  const chars = Math.max(clip(n.label, NODE_MAX_CHARS).length, clip(n.note, NODE_MAX_CHARS).length)
  const base = Math.max(NODE_MIN_W, chars * CHAR_PX + PAD_X * 2)
  // A diamond wastes its corners, so it needs more box to hold the same text.
  return n.shape === 'diamond' ? base * 1.45 : base
}

function nodeHeight(n: AnvilNode): number {
  return n.note ? ROW_H * 2 + 14 : ROW_H + 15
}

/**
 * Rank index -> pixel offset, and the size of each band.
 *
 * `dir` is applied by SWAPPING the axes at the end rather than by writing the
 * layout twice. Two copies of this arithmetic would drift the first time
 * somebody fixed a spacing bug in one of them.
 */
function place(
  ranks: AnvilNode[][],
  down: boolean,
  gutter: number,
): { placed: Map<string, Placed>; w: number; h: number } {
  const bands = ranks.map(row => Math.max(0, ...row.map(n => (down ? nodeHeight(n) : nodeWidth(n)))))
  const runs = ranks.map(row =>
    row.reduce((sum, n) => sum + (down ? nodeWidth(n) : nodeHeight(n)) + GAP, -GAP),
  )
  const longest = Math.max(0, ...runs)

  const placed = new Map<string, Placed>()
  let along = 0
  ranks.forEach((row, r) => {
    const band = bands[r] as number
    // Centre each rank against the tallest one, so a chain reads as a spine
    // rather than as a staircase hanging off the top edge.
    let across = (longest - (runs[r] as number)) / 2
    for (const n of row) {
      const w = nodeWidth(n)
      const h = nodeHeight(n)
      const acrossSize = down ? w : h
      const alongPos = along + (band - (down ? h : w)) / 2
      placed.set(n.id, {
        node: n,
        x: down ? across : alongPos,
        y: down ? alongPos : across,
        w,
        h,
      })
      across += acrossSize + GAP
    }
    along += band + gutter
  })

  const total = along - gutter
  return {
    placed,
    w: down ? longest : total,
    h: down ? total : longest,
  }
}

/** The three outlines. A shape nobody wrote a path for cannot reach this map. */
function nodeShape(p: Placed): string {
  const { x, y, w, h } = p
  if (p.node.shape === 'diamond') {
    const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`
    return `<polygon class="anvil-flow-box" points="${pts}"></polygon>`
  }
  const rx = p.node.shape === 'round' ? h / 2 : 6
  return `<rect class="anvil-flow-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"></rect>`
}

function nodeText(p: Placed): string {
  const cx = p.x + p.w / 2
  const label = clip(p.node.label, NODE_MAX_CHARS)
  const full = p.node.note ? `${p.node.label} — ${p.node.note}` : p.node.label
  const title = full === label ? '' : `<title>${esc(full)}</title>`
  if (!p.node.note) {
    return `${title}<text class="anvil-flow-label" x="${cx}" y="${p.y + p.h / 2}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`
  }
  return `${title}<text class="anvil-flow-label" x="${cx}" y="${p.y + p.h / 2 - 6}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text><text class="anvil-flow-note" x="${cx}" y="${p.y + p.h / 2 + 9}" text-anchor="middle" dominant-baseline="central">${esc(clip(p.node.note, NODE_MAX_CHARS))}</text>`
}

/** Where an edge leaves and enters a box, given the flow direction. */
function ports(from: Placed, to: Placed, down: boolean): { x1: number; y1: number; x2: number; y2: number } {
  return down
    ? { x1: from.x + from.w / 2, y1: from.y + from.h, x2: to.x + to.w / 2, y2: to.y }
    : { x1: from.x + from.w, y1: from.y + from.h / 2, x2: to.x, y2: to.y + to.h / 2 }
}

/**
 * An orthogonal connector: out of the box, across the gutter, into the next
 * box. Three segments, never a curve, because a right angle survives being
 * scaled down to a chat column and a bezier turns into a smudge.
 */
function connector(x1: number, y1: number, x2: number, y2: number, down: boolean): string {
  const mid = down ? (y1 + y2) / 2 : (x1 + x2) / 2
  return down ? `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}` : `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`
}

/**
 * A back edge, routed round the outside in its own lane.
 *
 * Cycles are legitimate -- a retry ladder is a cycle, and so is every state
 * machine worth drawing -- so they are neither dropped nor allowed to break the
 * ranking. They leave the far side of the source, run along a lane outside the
 * body, and come back into the near side of the target, dashed, so the return
 * reads as a return.
 */
function backConnector(from: Placed, to: Placed, lane: number, down: boolean): string {
  return down
    ? `M ${from.x} ${from.y + from.h / 2} H ${lane} V ${to.y + to.h / 2} H ${to.x}`
    : `M ${from.x + from.w / 2} ${from.y + from.h} V ${lane} H ${to.x + to.w / 2} V ${to.y + to.h}`
}

function edgeLabel(text: string, x: number, y: number): string {
  if (!text) return ''
  const t = clip(text, EDGE_MAX_CHARS)
  const w = t.length * CHAR_PX + 10
  return `<g class="anvil-flow-tag"><rect x="${(x - w / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="${w.toFixed(1)}" height="16" rx="4"></rect><text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(t)}</text></g>`
}

export function renderFlow(b: AnvilBlock): string {
  const graph = flowGraph(b)
  if (!graph.nodes.length) return '<p class="anvil-empty">No steps.</p>'

  const down = attrString(b, 'dir', 'right').toLowerCase() === 'down'
  const { placed, w, h } = place(graph.ranks, down, gutterFor(graph.edges, down))

  // A unique marker id per block: two flows on one page sharing `#anvil-arrow`
  // would both point at whichever rendered first, and the second would inherit
  // the first's colour.
  const arrow = `anvil-arrow-${slugId(b.id)}`

  // Back edges need a lane OUTSIDE the body to run in, so the viewBox grows on
  // exactly one side: left of a rightward flow, below a downward one.
  //
  // The lane carries the return's own label, and that label is centred ON the
  // lane -- so the box has to clear half of it or the text is sliced off at the
  // edge. `re-request` rendered as `equest` before this was accounted for.
  const hasBack = graph.edges.some(e => e.back)
  const backLabel = widestLabel(graph.edges.filter(e => e.back))
  const lane = down ? -LANE : h + LANE
  const pad = 8
  const clearance = LANE + backLabel / 2 + pad
  const minX = down && hasBack ? -clearance : -pad
  const minY = -pad
  const maxY = !down && hasBack ? h + clearance : h + pad
  const viewW = w + pad - minX
  const viewH = maxY - minY

  const wires = graph.edges
    .map((e: FlowEdge) => {
      const from = placed.get(e.from)
      const to = placed.get(e.to)
      if (!from || !to) return ''
      const cls = `anvil-flow-edge${e.back ? ' anvil-flow-back' : ''}${e.undirected ? ' anvil-flow-plain' : ''}`
      const head = e.undirected ? '' : ` marker-end="url(#${arrow})"`
      if (e.back) {
        return `<path class="${cls}" d="${backConnector(from, to, lane, down)}" fill="none"${head}></path>${edgeLabel(e.label, down ? lane : (from.x + to.x) / 2 + from.w / 2, down ? (from.y + to.y) / 2 + from.h / 2 : lane)}`
      }
      const { x1, y1, x2, y2 } = ports(from, to, down)
      // The label sits on the gutter crossing, which is the midpoint of the
      // middle segment whichever way the flow runs.
      return `<path class="${cls}" d="${connector(x1, y1, x2, y2, down)}" fill="none"${head}></path>${edgeLabel(e.label, (x1 + x2) / 2, (y1 + y2) / 2)}`
    })
    .join('')

  const boxes = graph.nodes
    .map(n => {
      const p = placed.get(n.id)
      if (!p) return ''
      return `<g class="anvil-flow-node" data-state="${n.state}" data-shape="${n.shape}">${nodeShape(p)}${nodeText(p)}</g>`
    })
    .join('')

  // Every node, in text, in rank order. The picture is an SVG with no reading
  // order of its own; this is the diagram for anybody who cannot see it.
  const list = graph.ranks
    .map((row, r) => row.map(n => `<li>Step ${r + 1}: ${esc(n.label)}${n.note ? ` — ${esc(n.note)}` : ''} (${STATE_LABEL[n.state].toLowerCase()})</li>`).join(''))
    .join('')
  const links = graph.edges
    .map(e => `<li>${esc(e.from)} ${e.undirected ? 'is connected to' : 'leads to'} ${esc(e.to)}${e.label ? `, ${esc(e.label)}` : ''}</li>`)
    .join('')

  return `<div class="anvil-flow" data-dir="${down ? 'down' : 'right'}">
    <svg class="anvil-flow-svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}" style="max-width:${Math.ceil(viewW)}px" font-size="${FONT_PX}" role="img" aria-label="${esc(b.prompt || 'Flow diagram')}">
      <defs><marker id="${arrow}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="anvil-flow-head" d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>
      ${wires}${boxes}
    </svg>
    <ul class="anvil-sr">${list}${links}</ul>
    ${graph.dropped > 0 ? `<p class="anvil-more">+${graph.dropped} more</p>` : ''}
  </div>${renderChips(b)}`
}

/* ── message ─────────────────────────────────────────────────────────────── */

export const CHANNEL_ICON: Record<MessageChannel, IconName> = {
  email: 'mail',
  memo: 'mail',
  whatsapp: 'message-circle',
  imessage: 'message-circle',
  sms: 'message-circle',
  signal: 'message-circle',
  telegram: 'message-circle',
  slack: 'hash',
  discord: 'hash',
}

/** One envelope line. Addresses are TEXT, never links -- see renderMessage. */
function envelopeRow(label: string, people: string[]): string {
  if (!people.length) return ''
  const names = people.map(p => `<span class="anvil-addr">${esc(p)}</span>`).join('')
  return `<div class="anvil-env-row"><span class="anvil-env-key">${label}</span><span class="anvil-env-val">${names}</span></div>`
}

function messageBody(b: AnvilBlock): string {
  const text = b.prose
  if (!text.trim()) return '<p class="anvil-empty">No body.</p>'
  // Blank lines are paragraph breaks, the same as everywhere else a human types.
  const paras = text
    .split('\n')
    .reduce<string[][]>(
      (acc, line) => {
        if (!line.trim()) {
          if (acc[acc.length - 1]?.length) acc.push([])
          return acc
        }
        acc[acc.length - 1]?.push(line)
        return acc
      },
      [[]],
    )
    .filter(p => p.length)
    .map(p => `<p>${esc(p.join('\n'))}</p>`)
    .join('')
  return `<div class="anvil-msg-body">${paras}</div>`
}

/** `+ patch.diff | 4 KB | text/x-diff` -- one line is one attachment. */
function attachments(b: AnvilBlock): string {
  if (!b.meta.length) return ''
  const items = b.meta
    .map(row => {
      const [name = '', ...rest] = row
      const detail = rest.length ? `<span class="anvil-attach-meta">${esc(rest.join(' · '))}</span>` : ''
      return `<li>${icon('paperclip')}<span class="anvil-attach-name">${esc(name)}</span>${detail}</li>`
    })
    .join('')
  return `<ul class="anvil-attach">${items}</ul>`
}

/**
 * A proposed message.
 *
 * ADDRESSES ARE NEVER LINKS. A `mailto:` in a draft is one mis-click away from
 * opening a composer pre-filled with agent-authored text, which is the exact
 * failure this block exists to prevent: the block is where a human READS what
 * is about to be sent, and the only affordance on it should be the one that
 * says yes.
 */
export function renderMessage(b: AnvilBlock): string {
  const chrome = messageChrome(messageChannel(b))
  const to = recipients(b, 'to')
  const cc = recipients(b, 'cc')
  const bcc = recipients(b, 'bcc')
  const from = attrString(b, 'from')

  const envelope =
    chrome === 'envelope'
      ? `<div class="anvil-envelope">
          ${envelopeRow('From', from ? [from] : [])}
          ${envelopeRow('To', to)}
          ${envelopeRow('Cc', cc)}
          ${envelopeRow('Bcc', bcc)}
        </div>`
      : ''

  // The gate lives on the shell, not here: it has to become the receipt when
  // the message stamps, and it must keep its height doing it (§9.2).
  return `${envelope}${messageBody(b)}${attachments(b)}`
}

/**
 * Which kinds need an explicit submit. Single-select locks on the click itself,
 * so a button there would be a second, meaningless step.
 */
const NEEDS_SUBMIT: Record<AnvilKind, (b: AnvilBlock) => boolean> = {
  choice: isMulti,
  gallery: isMulti,
  input: () => true,
  scale: () => true,
  note: () => false,
  // A card only submits when it is asking something AND the answer is a set.
  card: b => askable(b) && isMulti(b),
  // A board is a record. Layout is not answerable at all (§4.14 L5).
  board: () => false,
  // A picture of data and a picture of a process. Neither is a question, and
  // neither carries an `ask=` -- if the human is meant to choose one of the
  // things drawn here, the block for that is @choice, next to it.
  chart: () => false,
  flow: () => false,
  // Sending is one deliberate act, never a click-to-select -- and only while
  // the message is still a draft. A locked message keeps the question on
  // screen (§9.2) but the button is gone, because it has been answered.
  message: b => askable(b) && messageState(b) === 'draft',
  grid: () => false,
  stack: () => false,
}

/**
 * The default button face, per kind. "Confirm" on a block whose whole job is to
 * send an email says nothing about what the click does -- and the one moment a
 * button label matters is the one where the action leaves the building.
 */
const SUBMIT_LABEL: Partial<Record<AnvilKind, string>> = {
  message: 'Send',
}

export function submitBar(b: AnvilBlock): string {
  if (!(NEEDS_SUBMIT[b.kind] ?? (() => false))(b)) return ''
  const label = attrString(b, 'submit', SUBMIT_LABEL[b.kind] ?? 'Confirm')
  const danger = b.attrs.danger ? ' anvil-submit-danger' : ''
  return `<div class="anvil-actions"><button type="button" class="anvil-submit${danger}" disabled>${esc(label)}</button></div>`
}
