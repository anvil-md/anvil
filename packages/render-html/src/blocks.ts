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
  type AnvilField,
  type AnvilKind,
  type AnvilOption,
  type AnvilTask,
  attrNumber,
  attrString,
  type FieldType,
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
function cardProse(b: AnvilBlock): string {
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
