/**
 * Per-kind body renderers. Each takes a parsed block and returns an HTML
 * fragment; the shell in render.ts supplies the frame, prompt and footer.
 *
 * Buttons, inputs and sliders render at full fidelity and carry `disabled`
 * unless the `Ask` they are handed says the block is open for this viewer
 * (`inert` in ask.ts). No renderer here decides that for itself.
 *
 * SECURITY: `swatch`, `font` and `img` come from agent-authored text and land
 * in style/src attributes, where escaping alone is not enough. They are
 * ALLOWLISTED (see safeColor / safeFont / safeUrl), not sanitised -- a value
 * that fails the allowlist is dropped rather than escaped.
 */
import {
  type AnvilBlock,
  type AnvilDatum,
  type AnvilDelta,
  type AnvilDomain,
  type AnvilField,
  type AnvilKind,
  type AnvilNode,
  type AnvilOption,
  type AnvilTask,
  attrNumber,
  attrString,
  blockA11y,
  type ChartRender,
  chartDelta,
  chartDomain,
  chartGoal,
  chartPct,
  chartRender,
  deltaText,
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
  optionAlt,
  recipients,
  recommended,
  safeColor,
  safeFont,
  safeUrl,
  type TaskState,
  taskProgress,
  withUnit,
} from '@anvil-md/parser'
import { type Ask, type AskMode, dialNotch, fieldValue, inert, isPicked, notchPct } from './ask'
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

// The §8.3 allowlists live in the parser, so every surface draws the same rows.
export { safeUrl }

const MARK = '<span class="anvil-mark" aria-hidden="true"></span>'

function optionMeta(o: AnvilOption): string {
  return o.hint ? `<span class="anvil-hint">${esc(o.hint)}</span>` : ''
}

/**
 * The agent's pick, marked in words. Never preselected, never focused, never
 * the only row that looks pressable (§4.1.1): a single-select stamps on the
 * click, so a row that arrives chosen is the agent answering its own question.
 */
/**
 * A block's accessibility, as the attributes for its outermost element plus
 * the screen-reader-only text they point at (§9.13).
 *
 * Only what was AUTHORED becomes an attribute. The inferred name and
 * description are the prompt and subtext, already on screen and already read
 * in order; restating them as `aria-label` would make a screen reader say the
 * prompt twice.
 */
export function a11yAttrs(b: AnvilBlock): { attrs: string; sr: string } {
  const a = blockA11y(b)
  if (a.hidden) return { attrs: ' aria-hidden="true"', sr: '' }
  const parts: string[] = []
  let sr = ''
  if (attrString(b, 'alt').trim()) parts.push(` role="group" aria-label="${esc(a.label)}"`)
  if (attrString(b, 'desc').trim()) {
    const id = `anvil-desc-${slugId(b.id || b.kind)}`
    parts.push(` aria-describedby="${id}"`)
    sr = `<span class="anvil-sr" id="${id}">${esc(a.description)}</span>`
  }
  if (a.live !== 'off') parts.push(` aria-live="${a.live}"`)
  return { attrs: parts.join(''), sr }
}

/** A row's own accessible name, only when `alt=` gave it one. */
function rowLabel(o: AnvilOption): string {
  return o.alt?.trim() ? ` aria-label="${esc(optionAlt(o))}"` : ''
}

const REC_TAG = '<span class="anvil-rec">recommended</span>'

function recAttr(on: boolean): string {
  return on ? ' data-recommended="yes"' : ''
}

/**
 * What a pickable row carries for the hydrator and the record: its value, and
 * whether it was picked. `aria-pressed` only on `select=many`, where a row IS a
 * toggle; on `select=one` the click is the answer, so a row is never "on".
 */
function pickAttrs(ask: Ask | undefined, value: string, multi: boolean): string {
  const on = isPicked(ask, value)
  const pressed = multi && ask && ask.mode !== 'display' ? ` aria-pressed="${on}"` : ''
  return ` data-anvil-value="${esc(value)}"${on ? ' data-picked="yes"' : ''}${pressed}${inert(ask)}`
}

export function renderChoice(b: AnvilBlock, ask?: Ask): string {
  if (!b.options.length) return '<p class="anvil-empty">No options.</p>'
  const multi = isMulti(b)
  const rec = recommended(b)
  const rows = b.options
    .map((o, i) => {
      const danger = o.danger ? ' anvil-row-danger' : ''
      const mine = o.value === rec
      return `<button type="button" class="anvil-row${danger}"${recAttr(mine)}${rowLabel(o)}${pickAttrs(ask, o.value, multi)}>
        <span class="anvil-key">${multi ? MARK : esc(String(i + 1))}</span>
        <span class="anvil-row-main"><span class="anvil-label">${esc(o.label)}</span>${optionMeta(o)}${mine ? REC_TAG : ''}</span>
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
    // Hex chips mean nothing read aloud. With alt= they become one image with
    // a name; without it they stay out of the way and the label names the card.
    const named = o.alt?.trim() ? ` role="img" aria-label="${esc(optionAlt(o))}"` : ' aria-hidden="true"'
    return `<span class="anvil-swatch"${named}>${chips || '<i class="anvil-swatch-empty"></i>'}</span>`
  },
  type: o => {
    const fam = o.font ? safeFont(o.font) : null
    const style = fam ? ` style="font-family:'${fam}',serif"` : ''
    return `<span class="anvil-type"${style}>${esc(o.sample || 'Aa Bb Cc')}</span>`
  },
  image: o => {
    const url = o.img ? safeUrl(o.img) : null
    if (!url) return '<span class="anvil-img anvil-img-missing"></span>'
    return `<img class="anvil-img" src="${esc(url)}" alt="${esc(optionAlt(o))}" loading="lazy">`
  },
  card: () => '',
}

function cardFace(b: AnvilBlock, o: AnvilOption): string {
  return (FACES[galleryRender(b)] ?? FACES.card)(o)
}

export function renderGallery(b: AnvilBlock, ask?: Ask): string {
  if (!b.options.length) return '<p class="anvil-empty">No cards.</p>'
  const mode = galleryRender(b)
  const rec = recommended(b)
  const multi = isMulti(b)
  const cards = b.options
    .map((o, i) => {
      const face = cardFace(b, o)
      const mine = o.value === rec
      return `<button type="button" class="anvil-card"${recAttr(mine)}${pickAttrs(ask, o.value, multi)}>
        ${face}
        <span class="anvil-card-foot">
          <span class="anvil-key">${esc(String(i + 1))}</span>
          <span class="anvil-label">${esc(o.label)}</span>${mine ? REC_TAG : ''}
        </span>
        ${o.hint ? `<span class="anvil-hint">${esc(o.hint)}</span>` : ''}
      </button>`
    })
    .join('')
  // Same rule as @choice: single select locks on the click itself, so a submit
  // button would be a second, meaningless step.
  return `<div class="anvil-grid anvil-grid-${mode}">${cards}</div>`
}

/**
 * The checks a browser understands, as attributes, so a host that hydrates this
 * markup gets native constraint validation for free. `pattern=` is NOT emitted:
 * a browser would run it through its own backtracking engine, which is exactly
 * what §4.3.1 exists to avoid. The host runs `checkField` instead.
 */
function checkAttrs(f: AnvilField): string {
  const { min, max } = f.checks
  const lengthy = f.type !== 'number' && f.type !== 'date'
  const out = [f.required ? ' required' : '']
  if (min !== undefined) out.push(` ${lengthy ? 'minlength' : 'min'}="${esc(min)}"`)
  if (max !== undefined) out.push(` ${lengthy ? 'maxlength' : 'max'}="${esc(max)}"`)
  return out.join('')
}

/** `name=` for the hydrator, the answered value for the record, and live only while open. */
function fieldAttrs(f: AnvilField, ask: Ask | undefined): string {
  const v = fieldValue(ask, f.name)
  return ` name="${esc(f.name)}"${v === undefined ? '' : ` value="${esc(v)}"`}${inert(ask)}`
}

function textControl(type: string, f: AnvilField, id: string, ask?: Ask): string {
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''
  return `<input class="anvil-input" id="${id}" type="${type}"${fieldAttrs(f, ask)}${ph}${checkAttrs(f)}>`
}

/**
 * Agent text as one segment of a DOM id, losslessly.
 *
 * slugId is lossy, which a marker can live with and a label cannot: `a.b` and
 * `a-b` would share a field id, and so would block `x` with field `y-z` and
 * block `x-y` with field `z`. A label bound to the wrong control reads the
 * wrong name aloud. Everything outside [A-Za-z0-9-] becomes `_<hex>_` (an
 * underscore included), so `.` never appears in a segment and can join them.
 */
function idPart(s: string): string {
  return Array.from(s, c => (/[A-Za-z0-9-]/.test(c) ? c : `_${(c.codePointAt(0) ?? 0).toString(16)}_`)).join('')
}

/**
 * One control per field type. This was a ternary chain that collapsed every
 * type except `number` to a plain text input, so `secret` -- the one type whose
 * whole purpose is masking -- rendered its value in the clear, and `date`/`url`
 * silently lost their native controls.
 *
 * Every control carries the id its label points at. `bool` draws a span, which
 * a `for=` cannot reach, so it is a switch named by the label's own id. It was
 * `aria-hidden`, which took the field out of the accessibility tree entirely.
 */
const CONTROLS: Record<FieldType, (f: AnvilField, id: string, ask?: Ask) => string> = {
  text: (f, id, ask) => textControl('text', f, id, ask),
  number: (f, id, ask) => textControl('number', f, id, ask),
  secret: (f, id, ask) => textControl('password', f, id, ask),
  url: (f, id, ask) => textControl('url', f, id, ask),
  date: (f, id, ask) => textControl('date', f, id, ask),
  path: (f, id, ask) => textControl('text', f, id, ask),
  email: (f, id, ask) => textControl('email', f, id, ask),
  longtext: (f, id, ask) => {
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''
    const v = fieldValue(ask, f.name) ?? ''
    return `<textarea class="anvil-input" id="${id}" rows="3" name="${esc(f.name)}"${inert(ask)}${ph}${checkAttrs(f)}>${esc(v)}</textarea>`
  },
  // A span, so `disabled` means nothing to it: live is `tabindex="0"` and no
  // aria-disabled, and the hydrator flips aria-checked.
  bool: (f, id, ask) => {
    const on = fieldValue(ask, f.name) === 'true'
    const live = ask?.mode === 'open' ? ' tabindex="0"' : ' aria-disabled="true"'
    return `<span class="anvil-switch" id="${id}" role="switch" data-anvil-field="${esc(f.name)}" aria-checked="${on}"${live} aria-labelledby="${id}.label"></span>`
  },
}

/** Types whose control is not a form element, so the control names itself by the label's id instead. */
const NAMED_BY_LABEL_ID = new Set<FieldType>(['bool'])

const MONO_FIELDS = new Set<FieldType>(['path', 'url', 'secret', 'email'])

export function renderInput(b: AnvilBlock, ask?: Ask): string {
  if (!b.fields.length) return '<p class="anvil-empty">No fields.</p>'
  // The block id keeps two blocks' `email` fields apart on one page. A name
  // written twice in one block is a malformed fence, but its second control
  // still needs an id of its own, so repeats take their row index as well.
  const block = idPart(b.id || b.kind)
  const seen = new Set<string>()
  const rows = b.fields
    .map((f, i) => {
      const name = idPart(f.name)
      const id = `anvil-field-${block}.${name}${seen.has(name) ? `.${i}` : ''}`
      seen.add(name)
      const type: FieldType = Object.hasOwn(CONTROLS, f.type) ? f.type : 'text'
      const bind = NAMED_BY_LABEL_ID.has(type) ? ` id="${id}.label"` : ` for="${id}"`
      const opt = f.required ? '' : '<span class="anvil-optional">optional</span>'
      const mono = MONO_FIELDS.has(f.type) ? ' anvil-field-mono' : ''
      // Present and hidden: a hydrating host unhides it when checkField fails.
      // Leaving it out would parse `error=` and never draw it (§11).
      const error = f.checks.error ? `<small class="anvil-field-error" hidden>${esc(f.checks.error)}</small>` : ''
      return `<div class="anvil-field${mono}">
        <label class="anvil-field-label"${bind}>${esc(f.label)}${opt}</label>
        ${CONTROLS[type](f, id, ask)}${error}
      </div>`
    })
    .join('')
  return `<div class="anvil-fields">${rows}</div>`
}

export function renderScale(b: AnvilBlock, ask?: Ask): string {
  if (!b.dials.length) return '<p class="anvil-empty">No dials.</p>'
  // The parser already resolved `steps` and wrote it back, so this reads the
  // same number the dial values were clamped against. Re-deriving it here with
  // a different rule put the knob at `left: 300%` for `steps=1`: the parser
  // defaulted to 5 and clamped the value to 4, the renderer clamped to 2.
  const steps = Math.min(11, Math.max(2, attrNumber(b, 'steps', 5)))
  const rows = b.dials
    .map(d => {
      const notch = dialNotch(ask, d.name, d.value)
      // While open, a real range input lies over the track: arrows, drag and a
      // screen reader all get a native control (§9.6, §9.11), and the knob is
      // still the thing a sighted reader sees.
      const range =
        ask?.mode === 'open'
          ? `<input class="anvil-range" type="range" name="${esc(d.name)}" min="1" max="${steps}" step="1" value="${notch}" aria-label="${esc(`${d.left} to ${d.right}`)}">`
          : ''
      return `<div class="anvil-dial">
        <span class="anvil-pole">${esc(d.left)}</span>
        <span class="anvil-track">${range}<i class="anvil-knob" style="left:${notchPct(notch, steps)}%"></i></span>
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
  const a11y = a11yAttrs(b)
  return `<div class="anvil-note ${cls}"${a11y.attrs}><span class="anvil-icon">${mark}</span><div class="anvil-note-body">${paras}${warnings(b)}${a11y.sr}</div></div>`
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
  // `Kit · 3/7` is an assignee AND a count. Drawing only the count dropped Kit.
  const beside = t.meta ? `<span class="anvil-task-meta">${esc(t.meta)}</span>` : ''
  const meta =
    t.total !== undefined && t.done !== undefined
      ? `${beside}<span class="anvil-task-roll">${bar(t.done, t.total, `${t.done} of ${t.total} done`, ' anvil-bar-mini')}<span class="anvil-count">${t.done}/${t.total}</span></span>`
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
function taskRow(b: AnvilBlock, t: AnvilTask, i: number, pickIndex: number | null, rec = false): string {
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
      : `<button type="button" class="anvil-task-main anvil-task-pick"${recAttr(rec)} disabled><span class="anvil-key anvil-pick-key">${pickIndex}</span>${inner}${rec ? REC_TAG : ''}</button>`

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
  const rec = recommended(b)
  let pick = 0
  const rows = b.tasks
    .map((t, i) => {
      const open = asking && t.state === 'todo'
      return taskRow(b, t, i, open ? ++pick : null, open && t.ref === rec)
    })
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
  // "No subtasks." is the honest empty state for a card with nothing in it. On
  // a record that carries prose and chips -- a lead, a contact -- it announces
  // an absence nobody was looking for.
  const record = !b.tasks.length && !ask && (b.prose.trim() || b.meta.length)
  return `${renderProgress(b)}${tally}${cardProse(b)}${head}${record ? '' : renderTasks(b)}${renderChips(b)}`
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
          // The meta is why the card is in this lane as often as not -- "not a
          // lead", "blocked on ANV-117" -- and it was parsed and then dropped.
          const count = t.total !== undefined ? `${t.done}/${t.total}` : ''
          const meta = [t.meta, count].filter(Boolean).join(' · ')
          const line = meta ? `<span class="anvil-lane-meta">${esc(meta)}</span>` : ''
          return `<li class="anvil-lane-item">${ref}<span class="anvil-task-label">${esc(t.label)}</span>${line}</li>`
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
  return withUnit(d.raw || String(d.value), unit)
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

  // The last point is drawn OUTSIDE the svg, as a box positioned in percent of
  // the same plot. A <circle> in here was stretched with everything else: at
  // 1000px by 3.5rem it drew 50px wide and 2.8px tall, a dash whose right half
  // hung past the frame. vector-effect cannot save it, because only a stroke
  // has a non-scaling form; a shape's own geometry always scales.
  const last = data[n - 1]
  const dot = last
    ? `<i class="anvil-spark-last" style="left:${xs(n - 1).toFixed(2)}%;top:${ys(last.value).toFixed(2)}%"></i>`
    : ''

  return `<div class="anvil-spark-plot" aria-hidden="true"><svg class="anvil-spark-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
    ${fill}${rule}<polyline class="anvil-spark-line" points="${pts}" vector-effect="non-scaling-stroke"></polyline>
  </svg>${dot}</div>`
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

const DIRECTION_ICON: Record<AnvilDelta['direction'], IconName> = {
  up: 'trending-up',
  down: 'trending-down',
  flat: 'minus',
}

/** Said in words for a screen reader, because the tone is otherwise only a colour. */
const TONE_WORD: Record<AnvilDelta['tone'], string> = {
  good: 'better',
  bad: 'worse',
  neutral: '',
}

/**
 * `render=stat`: each row is a number, big, and the change from `was=` beneath
 * it. The change is COMPUTED (§4.16.5) and printed beside the number it came
 * from, so every figure on the tile is one the reader can check against another
 * one on the same tile.
 */
function renderStats(b: AnvilBlock, v: Visible, unit: string): string {
  const tiles = v.data
    .map(d => {
      const delta = chartDelta(b, d)
      const word = delta ? TONE_WORD[delta.tone] : ''
      const change = delta
        ? `<span class="anvil-stat-delta" data-tone="${delta.tone}">
            <span class="anvil-stat-dir">${icon(DIRECTION_ICON[delta.direction])}</span>
            <span>${esc(deltaText(d, delta, unit))}</span>${word ? `<span class="anvil-sr">, ${word}</span>` : ''}
            <span class="anvil-stat-was">from ${esc(withUnit(d.wasRaw ?? '', unit))}</span>
          </span>`
        : ''
      const note = d.note ? `<span class="anvil-stat-note">${esc(d.note)}</span>` : ''
      return `<li class="anvil-stat">
        ${d.label ? `<span class="anvil-stat-label">${esc(d.label)}</span>` : ''}
        <span class="anvil-stat-value">${esc(valueText(d, unit))}</span>${change}${note}
      </li>`
    })
    .join('')
  return `<ul class="anvil-stats anvil-auto" style="--anvil-cols:${Math.min(4, Math.max(1, v.data.length))};--anvil-min:6.5rem">${tiles}</ul>${more(v.after)}`
}

type ChartMode = (v: Visible, d: AnvilDomain, g: number | null, u: string, b: AnvilBlock) => string

/** One entry per render mode. A seventh mode is one line here plus one renderer. */
const CHART_MODES: Record<ChartRender, ChartMode> = {
  bar: (v, d, g, u) => renderBars(v, d, g, u, false),
  dot: (v, d, g, u) => renderBars(v, d, g, u, true),
  column: renderColumns,
  line: (v, d, g, u) => renderLine(v, d, g, u, false),
  spark: (v, d, g, u) => renderLine(v, d, g, u, true),
  stat: (v, _d, _g, u, b) => renderStats(b, v, u),
}

export function renderChart(b: AnvilBlock): string {
  if (!b.data.length) return '<p class="anvil-empty">No data.</p>'
  const mode = chartRender(b)
  const v = visible(b, mode)
  const domain = chartDomain(b, v.data)
  // A stat has no scale, so it has no goal marker and no scale line either; the
  // parser has already warned about any min=, max= or goal= it was handed.
  const scaled = mode !== 'stat'
  const goal = scaled ? chartGoal(b) : null
  const unit = attrString(b, 'unit')
  const body = (CHART_MODES[mode] ?? CHART_MODES.bar)(v, domain, goal, unit, b)
  // AN AXIS THAT IS NOT WHAT A READER ASSUMES MUST SAY SO. A bar chart is read
  // as "length is magnitude", and both of these break that read: a raised floor
  // means the bars are differences rather than amounts, and an authored ceiling
  // means the longest bar is not the maximum. Neither is dishonest labelled;
  // both are dishonest silent, and the truncated floor is the one that has been
  // fooling people since printed newspapers.
  const parts = scaled
    ? [
        domain.authoredFloor ? `scale from ${esc(String(domain.floor))}${esc(unit)}, not zero` : '',
        domain.authoredTop ? `to ${esc(String(domain.top))}${esc(unit)}` : '',
        goal !== null ? `goal ${esc(String(goal))}${esc(unit)}` : '',
      ].filter(Boolean)
    : []
  const scale = parts.length ? `<p class="anvil-chart-scale">${parts.join(' · ')}</p>` : ''
  const truncated = scaled && domain.authoredFloor ? ' anvil-chart-truncated' : ''
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
/** An edge label's pill: its height, and the least room it leaves to a box. */
const TAG_H = 16
const TAG_CLEAR = 8

/** The widest edge label, in pixels, once clipping has had its say. */
function widestLabel(edges: FlowEdge[]): number {
  return edges.reduce((m, e) => Math.max(m, tagWidth(e.label)), 0)
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

/** Where one rank's band begins and ends along the flow. */
interface Band {
  start: number
  end: number
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
 *
 * `gutters[r]` is the gap after rank `r`, and `bands[r]` is where rank `r`
 * begins and ends along the flow, so gutter `r` runs from `bands[r].end` to
 * `bands[r + 1].start` and can be sized to what has to cross it.
 */
function place(
  ranks: AnvilNode[][],
  down: boolean,
  gutters: number[],
): { placed: Map<string, Placed>; w: number; h: number; bands: Band[] } {
  const bands = ranks.map(row => Math.max(0, ...row.map(n => (down ? nodeHeight(n) : nodeWidth(n)))))
  const runs = ranks.map(row =>
    row.reduce((sum, n) => sum + (down ? nodeWidth(n) : nodeHeight(n)) + GAP, -GAP),
  )
  const longest = Math.max(0, ...runs)

  const placed = new Map<string, Placed>()
  const out: Band[] = []
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
    out.push({ start: along, end: along + band })
    along += band + (gutters[r] ?? 0)
  })

  return {
    placed,
    w: down ? longest : along,
    h: down ? along : longest,
    bands: out,
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

/**
 * A point in flow terms: how far ALONG the ranks, and how far ACROSS them. A
 * downward flow runs along y and a rightward one along x. Every route is
 * worked out in these terms and turned into svg once, in `svgXY`, for the
 * reason `place` swaps its axes: two copies of the routing would drift.
 */
type Pt = readonly [along: number, across: number]

function svgXY(p: Pt, down: boolean): [number, number] {
  return down ? [p[1], p[0]] : [p[0], p[1]]
}

/** A placed box in flow terms: where it begins and ends along the flow, and across it. */
interface Span {
  start: number
  end: number
  lo: number
  hi: number
}

function spanOf(p: Placed, down: boolean): Span {
  return down ? { start: p.y, end: p.y + p.h, lo: p.x, hi: p.x + p.w } : { start: p.x, end: p.x + p.w, lo: p.y, hi: p.y + p.h }
}

function middle(a: number, b: number): number {
  return (a + b) / 2
}

/**
 * An orthogonal route as an svg path. Every leg is an H or a V, never a curve,
 * because a right angle survives being scaled down to a chat column and a
 * bezier turns into a smudge. A leg that goes nowhere is left out, so the
 * arrowhead always takes its angle from a leg that has one.
 */
function svgPath(points: Pt[], down: boolean): string {
  const [first = [0, 0], ...rest] = points.map(p => svgXY(p, down))
  let [x, y] = first
  let d = `M ${x} ${y}`
  for (const [nx, ny] of rest) {
    if (nx === x && ny === y) continue
    d += nx === x ? ` V ${ny}` : ny === y ? ` H ${nx}` : ` L ${nx} ${ny}`
    x = nx
    y = ny
  }
  return d
}

/** One label row in a downward gutter: the pill and a little air, and the margin above and below the rows. */
const ROW_STEP = TAG_H + 4
const ROW_PAD = 6

/**
 * Which row of its gutter each downward edge turns in, and how many rows each
 * gutter needs.
 *
 * A downward edge crosses its gutter sideways and its label sits where it
 * turns. Every edge out of one node used to turn at the same height, so their
 * labels shared one line, centred half the target spacing apart, and "yes" sat
 * under "changes requested". Now each labelled edge between adjacent ranks
 * turns in a row of its own and the unlabelled ones share one, as they always
 * did. Rows go farthest-reaching first, so a fan opens without crossing
 * itself.
 *
 * A gutter with one row or none turns where it always did. A rightward flow
 * needs none of this: its labels stack down the gutter at least a node's
 * height apart. An edge that skips a rank, or a return, turns on a track of
 * its own beside the rows (`trackPlan`).
 */
function turnRows(edges: FlowEdge[], placed: Map<string, Placed>, gaps: number): { row: Map<FlowEdge, number>; rows: number[] } {
  const row = new Map<FlowEdge, number>()
  const rows = Array.from({ length: gaps }, () => 0)
  const centre = (id: string): number => {
    const p = placed.get(id)
    return p ? p.x + p.w / 2 : 0
  }
  const reach = (group: FlowEdge[]): number =>
    group.reduce((m, e) => Math.max(m, Math.abs(centre(e.to) - centre(e.from))), 0)

  for (let g = 0; g < gaps; g++) {
    const here = edges.filter(e => edgeKind(e) === 'next' && e.fromRank === g)
    const plain = here.filter(e => !e.label)
    const groups = [...(plain.length ? [plain] : []), ...here.filter(e => e.label).map(e => [e])]
    if (groups.length < 2) continue
    groups.sort((a, b) => reach(b) - reach(a))
    groups.forEach((group, i) => {
      for (const e of group) row.set(e, i)
    })
    rows[g] = groups.length
  }
  return { row, rows }
}

/** From a band to the first track beside it, between two tracks, and from the last track to the forward edges. */
const TRACK_PAD = 8
const TRACK_STEP = 8
/** A track before a rank stays above the arrowheads that land on it, and leaves room for its own. */
const HEAD_CLEAR = 14

/** Which side of its rank an edge end's track runs on: in the gutter before the rank, or the one after it. */
type TrackSide = 'before' | 'after'

/**
 * Which side of its rank each end of an edge takes its track on: toward the
 * edge's other end. An edge between neighbouring ranks never takes one; its
 * entry is here so every kind has one.
 */
const TRACK_SIDE: Record<EdgeKind, { from: TrackSide; to: TrackSide }> = {
  next: { from: 'after', to: 'before' },
  skip: { from: 'after', to: 'before' },
  return: { from: 'before', to: 'after' },
}

/** Where each side's `i`th track runs along the flow, given the rank's band. */
const TRACK_AT: Record<TrackSide, (band: Band, i: number) => number> = {
  before: (band, i) => band.start - HEAD_CLEAR - i * TRACK_STEP,
  after: (band, i) => band.end + TRACK_PAD + i * TRACK_STEP,
}

/**
 * The tracks: lines across a gutter, one per edge end, beside a rank and clear
 * of the forward edges' rows and labels in the middle of the gutter.
 *
 * Two kinds of edge end leave the middle of the gutter to the forward edges.
 *
 * An edge that skips a rank turned halfway between its ports, which is the
 * middle of the rank it skips: `a -> c` ran through Beta step and its label
 * lay under it. It now takes a track AFTER its source's rank out to a channel
 * past the ranks it skips, and one BEFORE its target's rank back in. A shared
 * row or the gutter's middle line put it on top of other edges' turns.
 *
 * A return leaves the side of its source that faces the lane and comes back
 * into the same side of its target, and that side is only open on the node at
 * the lane end of its rank. From any other node the run along the rank went
 * under its neighbours: `fix -> review` on the site passed under the Merge box.
 * So a blocked end steps into the gap beside its node and takes a track toward
 * the return's other end: BEFORE its rank for a source, AFTER it for a target.
 *
 * `slot` is each end's place among the tracks on its side of its rank; `count`
 * says how many tracks each side of each rank holds.
 */
function trackPlan(graph: FlowGraph, down: boolean): {
  slot: Map<FlowEdge, { from?: number; to?: number }>
  count: Record<TrackSide, Map<number, number>>
} {
  const open = new Set(graph.ranks.map(row => (down ? row[0] : row[row.length - 1])?.id))
  const count: Record<TrackSide, Map<number, number>> = { before: new Map(), after: new Map() }
  const take = (side: TrackSide, rank: number): number => {
    const n = count[side].get(rank) ?? 0
    count[side].set(rank, n + 1)
    return n
  }
  /** Whether the end of an edge at node `id` takes a track. */
  const needs: Record<EdgeKind, (id: string) => boolean> = {
    next: () => false,
    skip: () => true,
    return: id => !open.has(id),
  }
  const slot = new Map<FlowEdge, { from?: number; to?: number }>()
  for (const e of graph.edges) {
    const kind = edgeKind(e)
    const side = TRACK_SIDE[kind]
    const from = needs[kind](e.from) ? take(side.from, e.fromRank) : undefined
    const to = needs[kind](e.to) ? take(side.to, e.toRank) : undefined
    if (from !== undefined || to !== undefined) slot.set(e, { from, to })
  }
  return { slot, count }
}

/** The room `n` tracks take in a gutter: `pad` from the band to the first, a step to each next, and air before the forward edges. */
function zone(n: number, pad: number): number {
  return n ? pad + (n - 1) * TRACK_STEP + TRACK_PAD : 0
}

/** An edge label: its clipped text, its centre, and its pill's width. */
interface Tag {
  text: string
  x: number
  y: number
  w: number
}

function tagWidth(label: string): number {
  return label ? clip(label, EDGE_MAX_CHARS).length * CHAR_PX + 10 : 0
}

function tagAt(label: string, at: Pt, down: boolean): Tag | null {
  if (!label) return null
  const [x, y] = svgXY(at, down)
  return { text: clip(label, EDGE_MAX_CHARS), x, y, w: tagWidth(label) }
}

/** How far a label reaches across the flow on the `sign` side of its centre. */
function tagReach(t: Tag, down: boolean, sign: number): number {
  return down ? t.x + (sign * t.w) / 2 : t.y + (sign * TAG_H) / 2
}

function edgeLabel(t: Tag): string {
  return `<g class="anvil-flow-tag"><rect x="${(t.x - t.w / 2).toFixed(1)}" y="${(t.y - TAG_H / 2).toFixed(1)}" width="${t.w.toFixed(1)}" height="${TAG_H}" rx="4"></rect><text x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(t.text)}</text></g>`
}

type FlowGraph = ReturnType<typeof flowGraph>

interface FlowPlacement {
  placed: Map<string, Placed>
  w: number
  h: number
  bands: Band[]
  /** Where each edge between neighbouring ranks turns, along the flow. */
  turns: Map<FlowEdge, number>
  /** Where each edge end that takes a track runs across its gutter, along the flow. */
  tracks: Map<FlowEdge, { from?: number; to?: number }>
  down: boolean
}

/** The room gutter `g` keeps for tracks: after the rank before it, and before the rank after it. */
type Zones = (g: number) => { after: number; before: number }

/**
 * Where every node goes. The rows and the tracks are counted against a first
 * placement, then the gutters that need them grow. Gutters only move a rank
 * along the flow, never across it, so the spans the rows were sorted by do not
 * change.
 */
function layoutFlow(graph: FlowGraph, down: boolean): FlowPlacement {
  const gaps = Math.max(0, graph.ranks.length - 1)
  const even = Array.from({ length: gaps }, () => gutterFor(graph.edges, down))
  const { row, rows } = down
    ? turnRows(graph.edges, place(graph.ranks, down, even).placed, gaps)
    : { row: new Map<FlowEdge, number>(), rows: [] }
  const plan = trackPlan(graph, down)
  const zones: Zones = g => ({
    after: zone(plan.count.after.get(g) ?? 0, TRACK_PAD),
    before: zone(plan.count.before.get(g + 1) ?? 0, HEAD_CLEAR),
  })
  const gutters = even.map((size, g) => {
    const n = rows[g] ?? 0
    const { after, before } = zones(g)
    return (n ? Math.max(size, n * ROW_STEP + 2 * ROW_PAD) : size) + after + before
  })
  const at = place(graph.ranks, down, gutters)
  return { ...at, turns: turnsAt(graph, row, at, zones, down), tracks: tracksAt(plan.slot, at.bands), down }
}

/**
 * Where each edge between neighbouring ranks turns along the flow. One with a
 * row turns in it. Any other turns halfway between its ports, moved to the
 * middle of the part of the gutter the tracks leave to it, which is where an
 * edge always turned.
 */
function turnsAt(
  graph: FlowGraph,
  row: Map<FlowEdge, number>,
  at: { placed: Map<string, Placed>; bands: Band[] },
  zones: Zones,
  down: boolean,
): Map<FlowEdge, number> {
  const turns = new Map<FlowEdge, number>()
  for (const e of graph.edges.filter(e => edgeKind(e) === 'next')) {
    const from = at.placed.get(e.from)
    const to = at.placed.get(e.to)
    if (!from || !to) continue
    const { after, before } = zones(e.fromRank)
    const r = row.get(e)
    const along =
      r === undefined
        ? middle(spanOf(from, down).end, spanOf(to, down).start) + (after - before) / 2
        : (at.bands[e.fromRank]?.end ?? 0) + after + ROW_PAD + (r + 0.5) * ROW_STEP
    turns.set(e, along)
  }
  return turns
}

/** Each track's place along the flow, beside its end's rank on the side `TRACK_SIDE` gives that kind of edge. */
function tracksAt(slot: Map<FlowEdge, { from?: number; to?: number }>, bands: Band[]): Map<FlowEdge, { from?: number; to?: number }> {
  const band = (rank: number): Band => bands[rank] ?? { start: 0, end: 0 }
  const out = new Map<FlowEdge, { from?: number; to?: number }>()
  for (const [e, s] of slot) {
    const side = TRACK_SIDE[edgeKind(e)]
    out.set(e, {
      from: s.from === undefined ? undefined : TRACK_AT[side.from](band(e.fromRank), s.from),
      to: s.to === undefined ? undefined : TRACK_AT[side.to](band(e.toRank), s.to),
    })
  }
  return out
}

/** Which router draws an edge: the next rank over, past ranks it skips, or back as a return. */
type EdgeKind = 'next' | 'skip' | 'return'

function edgeKind(e: FlowEdge): EdgeKind {
  if (e.back) return 'return'
  return e.toRank - e.fromRank > 1 ? 'skip' : 'next'
}

/** The edges of one kind that have both ends placed. */
function placedEdges(graph: FlowGraph, at: FlowPlacement, kind: EdgeKind): { e: FlowEdge; from: Placed; to: Placed }[] {
  return graph.edges.flatMap(e => {
    const from = at.placed.get(e.from)
    const to = at.placed.get(e.to)
    return edgeKind(e) === kind && from && to ? [{ e, from, to }] : []
  })
}

/** An edge and the corners its path turns at, in flow terms. */
interface Route {
  e: FlowEdge
  points: Pt[]
}

/** Where a forward edge leaves its source and enters its target: the far side, then the near side, each at its middle across. */
function forwardPorts(from: Placed, to: Placed, down: boolean): [Pt, Pt] {
  const a = spanOf(from, down)
  const b = spanOf(to, down)
  return [
    [a.end, middle(a.lo, a.hi)],
    [b.start, middle(b.lo, b.hi)],
  ]
}

/**
 * The edges between neighbouring ranks: out of the box, across the gutter at
 * the edge's turn, into the next box. A label sits on the gutter crossing,
 * which is the midpoint of the middle segment whichever way the flow runs, at
 * the edge's own row where a downward gutter has rows.
 */
function forwardEdges(graph: FlowGraph, at: FlowPlacement, routes: Route[], tags: Tag[]): void {
  for (const { e, from, to } of placedEdges(graph, at, 'next')) {
    const [p, q] = forwardPorts(from, to, at.down)
    const turn = at.turns.get(e) ?? middle(p[0], q[0])
    routes.push({ e, points: [p, [turn, p[1]], [turn, q[1]], q] })
    const t = tagAt(e.label, [turn, middle(p[1], q[1])], at.down)
    if (t) tags.push(t)
  }
}

/**
 * A run outside the body, along the flow: a return's lane, or the channel an
 * edge takes past the ranks it skips. `lo` and `hi` are its extent along the
 * flow with its label included; `half` is how far the label reaches across
 * from the line, toward the body and away from it.
 */
interface Run {
  lo: number
  hi: number
  half: number
}

/**
 * A run from `a` to `b` along the flow with `label` centred on it. The label
 * is a pill on its side, so beside a downward run it reaches its width across
 * and its height along, and under a rightward one the other way round.
 */
function runOf(label: string, a: number, b: number, down: boolean): Run {
  const w = tagWidth(label)
  const reach = w ? (down ? TAG_H : w) / 2 : 0
  return { lo: Math.min(a, b, middle(a, b) - reach), hi: Math.max(a, b, middle(a, b) + reach), half: w ? (down ? w : TAG_H) / 2 : 0 }
}

/**
 * Where each run goes across the flow, stepping out from `edge` on the `sign`
 * side of the body.
 *
 * Every return once ran in ONE lane, so `c -> b` and `d -> a` drew on the same
 * line and both labels sat at the same midpoint. Now each run steps past every
 * run already placed that it overlaps along the flow, far enough that neither
 * label reaches the other's line. Shortest first, so a short return nests
 * inside a long one and their lanes do not cross. Runs that never overlap
 * share a line, because nothing can mistake one for the other.
 */
function stackRuns(runs: Run[], edge: number, sign: number): number[] {
  const order = runs.map((r, i) => ({ r, i })).sort((a, b) => a.r.hi - a.r.lo - (b.r.hi - b.r.lo) || a.r.lo - b.r.lo)
  const out = runs.map(() => edge)
  const done: { r: Run; off: number }[] = []
  for (const { r, i } of order) {
    const off = done
      .filter(d => d.r.lo <= r.hi && r.lo <= d.r.hi)
      .reduce((m, d) => Math.max(m, d.off + Math.max(LANE, d.r.half + r.half + TAG_CLEAR)), Math.max(LANE, r.half + TAG_CLEAR))
    done.push({ r, off })
    out[i] = edge + sign * off
  }
  return out
}

/** The outermost thing drawn so far on the `sign` side of the flow, across it: a box edge, or a label that reaches past one. */
function outerEdge(at: FlowPlacement, tags: Tag[], sign: number): number {
  const body = sign > 0 ? (at.down ? at.w : at.h) : 0
  const pick = sign > 0 ? Math.max : Math.min
  return tags.reduce((m, t) => pick(m, tagReach(t, at.down, sign)), body)
}

/**
 * The edges that skip a rank.
 *
 * Ranks are longest-path, so `a -> b -> c` plus `a -> c` puts `a -> c` across
 * two gutters, and turning it halfway between its ports put the turn, the line
 * and the label in the middle of the Beta step it skipped. Now it leaves on
 * its track after its source's rank, runs past the ranks it skips in a channel
 * beyond the FAR side of the body -- the near side is the returns' -- and
 * comes back on its track before its target's rank. Its label sits on the
 * channel, beside the ranks it skips. The forward labels are already in `tags`
 * and may reach past the outermost box, so the channels start beyond them.
 */
function skipEdges(graph: FlowGraph, at: FlowPlacement, routes: Route[], tags: Tag[]): void {
  const far = at.down ? 1 : -1
  const legs = placedEdges(graph, at, 'skip').map(({ e, from, to }) => {
    const [p, q] = forwardPorts(from, to, at.down)
    const track = at.tracks.get(e)
    return { e, p, q, out: track?.from ?? p[0], back: track?.to ?? q[0] }
  })
  const channels = stackRuns(
    legs.map(l => runOf(l.e.label, l.out, l.back, at.down)),
    outerEdge(at, tags, far),
    far,
  )
  legs.forEach(({ e, p, q, out, back }, i) => {
    const c = channels[i] ?? 0
    routes.push({ e, points: [p, [out, p[1]], [out, c], [back, c], [back, q[1]], q] })
    const t = tagAt(e.label, [middle(out, back), c], at.down)
    if (t) tags.push(t)
  })
}

/**
 * How one end of a return gets from its node to the lane, listed from the node
 * outward: straight out of the side when nothing is in the way, otherwise into
 * the gap beside the node, along it to the end's own track in the gutter, and
 * out along that. `side` is the port, `gap` the middle of the gap across, and
 * `track` where the run meets the lane along the flow.
 */
const ESCAPE: Record<'side' | 'gap', (side: Pt, gap: number, track: number, lane: number) => Pt[]> = {
  side: (s, _gap, _track, lane) => [s, [s[0], lane]],
  gap: (s, gap, track, lane) => [s, [s[0], gap], [track, gap], [track, lane]],
}

/** One end of a return: where it meets its lane along the flow, and its corners once the lane is known. */
function returnEnd(p: Placed, track: number | undefined, sign: number, down: boolean): { along: number; to: (lane: number) => Pt[] } {
  const s = spanOf(p, down)
  const side = sign < 0 ? s.lo : s.hi
  const port: Pt = [middle(s.start, s.end), side]
  const way = track === undefined ? 'side' : 'gap'
  const along = track ?? port[0]
  return { along, to: lane => ESCAPE[way](port, side + (sign * GAP) / 2, along, lane) }
}

/**
 * Back edges, each in a lane OUTSIDE the body: left of a downward flow, below
 * a rightward one.
 *
 * Cycles are legitimate -- a retry ladder is a cycle, and so is every state
 * machine worth drawing -- so they are neither dropped nor allowed to break the
 * ranking. A return leaves the lane side of its source, runs along its lane,
 * and comes back into the lane side of its target, dashed, so it reads as a
 * return. Its label is centred ON its lane, and half of it reaches back toward
 * the body ALONG THE AXIS IT CROSSES: its width beside the vertical lane of a
 * downward flow, its height under the horizontal lane of a rightward one. A
 * fixed 26 put a downward "fix and rebuild" across the Test box. The labels
 * already in `tags` may reach past the outermost box, so the lanes start
 * beyond them.
 */
function backEdges(graph: FlowGraph, at: FlowPlacement, routes: Route[], tags: Tag[]): void {
  const sign = at.down ? -1 : 1
  const ends = placedEdges(graph, at, 'return').map(({ e, from, to }) => {
    const track = at.tracks.get(e)
    return { e, out: returnEnd(from, track?.from, sign, at.down), back: returnEnd(to, track?.to, sign, at.down) }
  })
  const lanes = stackRuns(
    ends.map(r => runOf(r.e.label, r.out.along, r.back.along, at.down)),
    outerEdge(at, tags, sign),
    sign,
  )
  ends.forEach(({ e, out, back }, i) => {
    const lane = lanes[i] ?? 0
    routes.push({ e, points: [...out.to(lane), ...back.to(lane).reverse()] })
    const t = tagAt(e.label, [middle(out.along, back.along), lane], at.down)
    if (t) tags.push(t)
  })
}

/**
 * The viewBox is whatever was drawn, plus a margin: every box, every label,
 * and every corner of every route, lanes and channels included. Computed from
 * the drawing rather than predicted, because a prediction is what sliced
 * `re-request` to `equest`.
 */
function drawnBounds(at: FlowPlacement, tags: Tag[], routes: Route[]): { x: number; y: number; w: number; h: number } {
  const pad = 8
  const box = { x0: 0, y0: 0, x1: at.w, y1: at.h }
  const take = (x0: number, y0: number, x1: number, y1: number): void => {
    box.x0 = Math.min(box.x0, x0)
    box.y0 = Math.min(box.y0, y0)
    box.x1 = Math.max(box.x1, x1)
    box.y1 = Math.max(box.y1, y1)
  }
  for (const t of tags) take(t.x - t.w / 2, t.y - TAG_H / 2, t.x + t.w / 2, t.y + TAG_H / 2)
  for (const r of routes) {
    for (const p of r.points) {
      const [x, y] = svgXY(p, at.down)
      take(x, y, x, y)
    }
  }
  return { x: box.x0 - pad, y: box.y0 - pad, w: box.x1 - box.x0 + 2 * pad, h: box.y1 - box.y0 + 2 * pad }
}

export function renderFlow(b: AnvilBlock): string {
  const graph = flowGraph(b)
  if (!graph.nodes.length) return '<p class="anvil-empty">No steps.</p>'

  const down = attrString(b, 'dir', 'right').toLowerCase() === 'down'
  const at = layoutFlow(graph, down)
  const { placed } = at

  // A unique marker id per block: two flows on one page sharing `#anvil-arrow`
  // would both point at whichever rendered first, and the second would inherit
  // the first's colour.
  const arrow = `anvil-arrow-${slugId(b.id)}`
  const wire = ({ e, points }: Route): string => {
    const cls = `anvil-flow-edge${e.back ? ' anvil-flow-back' : ''}${e.undirected ? ' anvil-flow-plain' : ''}`
    const head = e.undirected ? '' : ` marker-end="url(#${arrow})"`
    return `<path class="${cls}" d="${svgPath(points, down)}" fill="none"${head}></path>`
  }

  // Forward edges, then the ones that skip ranks, then the returns: each
  // router places its runs beyond the labels the ones before it put down.
  const routes: Route[] = []
  const tags: Tag[] = []
  forwardEdges(graph, at, routes, tags)
  skipEdges(graph, at, routes, tags)
  backEdges(graph, at, routes, tags)
  const view = drawnBounds(at, tags, routes)
  const [minX, minY, viewW, viewH] = [view.x, view.y, view.w, view.h]

  // Every wire first, every label after, so no line is ever painted across a
  // label that an earlier edge put down.
  const wires = `${routes.map(wire).join('')}${tags.map(edgeLabel).join('')}`

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

/**
 * The button keeps its place in every state, because §9.2 forbids a block
 * changing height on stamp: once answered it says so and stays put.
 */
const SUBMIT_STATE: Record<AskMode, (label: string) => string> = {
  display: label => label,
  open: label => label,
  pending: () => 'Sending',
  stamped: () => 'Answered',
}

export function submitBar(b: AnvilBlock, ask?: Ask): string {
  if (!(NEEDS_SUBMIT[b.kind] ?? (() => false))(b)) return ''
  const label = SUBMIT_STATE[ask?.mode ?? 'display'](attrString(b, 'submit', SUBMIT_LABEL[b.kind] ?? 'Confirm'))
  const danger = b.attrs.danger ? ' anvil-submit-danger' : ''
  const hook = ask?.mode === 'open' ? ' data-anvil-submit' : ''
  return `<div class="anvil-actions"><button type="button" class="anvil-submit${danger}"${hook}${inert(ask)}>${esc(label)}</button></div>`
}
