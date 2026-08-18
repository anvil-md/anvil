/**
 * AnvilDoc -> HTML string.
 *
 * A STRING, deliberately, not a component tree. Most surfaces that render an
 * agent's markdown already pipe it through a markdown library and hydrate
 * afterwards (the same way mermaid and syntax highlighting are usually done),
 * so a string drops straight into that pipeline with no framework coupling and
 * no component lifecycle. Use it from React, Vue, Svelte, a static site
 * generator, or a plain server response.
 *
 * The trade is that this package is display-only. When you implement stamping,
 * this file is the part you replace; @anvil-md/parser is not.
 */
import {
  type AnvilBlock,
  type AnvilKind,
  attrNumber,
  attrString,
  cardStatus,
  type GalleryRender,
  galleryRender,
  isLocked,
  messageAt,
  type MessageChannel,
  messageChannel,
  messageChrome,
  messageState,
  type MessageState,
  parseAnvil,
  recipients,
  type TaskState,
  taskProgress,
} from '@anvil-md/parser'
import {
  CHANNEL_ICON,
  esc,
  renderBoard,
  renderCard,
  renderChoice,
  renderGallery,
  renderInput,
  renderMessage,
  pick,
  renderNote,
  renderScale,
  safeUrl,
  STATE_ICON,
  STATE_LABEL,
  submitBar,
  warnings,
} from './blocks'
import { type IconName, icon, resolveIcon } from './icons'

type BodyRenderer = (block: AnvilBlock) => string

/** Strategy map, not a switch chain: a new kind is one entry plus one renderer. */
const BODIES: Partial<Record<AnvilKind, BodyRenderer>> = {
  choice: renderChoice,
  gallery: renderGallery,
  input: renderInput,
  scale: renderScale,
  note: renderNote,
  card: renderCard,
  board: renderBoard,
  message: renderMessage,
}

/**
 * Inline SVG, never a glyph. Text icons fell out of the transcript's monospace
 * stack into a fallback font and drew a tofu box; a vector cannot.
 */
const KIND_ICON: Record<AnvilKind, IconName> = {
  choice: 'list-checks',
  gallery: 'images',
  input: 'text-cursor-input',
  scale: 'sliders-horizontal',
  note: 'info',
  card: 'ticket',
  board: 'columns-3',
  message: 'mail',
  grid: 'layout-grid',
  stack: 'layout-grid',
}

/** A gallery's icon follows what its cards actually show. */
const GALLERY_ICON: Record<GalleryRender, IconName> = {
  image: 'images',
  swatch: 'palette',
  type: 'type',
  card: 'layout-grid',
}

/** A card's icon follows what kind of ticket it claims to be. */
const CARD_ICON: Record<string, IconName> = {
  epic: 'layers',
  bug: 'octagon-alert',
  spike: 'info',
}

function blockIcon(block: AnvilBlock): IconName {
  let base = KIND_ICON[block.kind]
  if (block.kind === 'gallery') base = GALLERY_ICON[galleryRender(block)]
  // pick(), not `?? fallback`: `type=__proto__` inherits rather than falls back.
  if (block.kind === 'card') base = pick(CARD_ICON, attrString(block, 'type').toLowerCase(), 'ticket')
  return resolveIcon(block.attrs.icon, base)
}

/* ── the ordinary ASK frame ──────────────────────────────────────────────── */

function shell(block: AnvilBlock, partial: boolean): string {
  const body = (BODIES[block.kind] ?? renderNote)(block)

  // A note is chrome-less: it is prose, not a question. It also renders its own
  // warnings, since it has no frame to hang them off.
  if (block.kind === 'note') return body

  const head = block.prompt
    ? `<div class="anvil-prompt"><span class="anvil-icon">${icon(blockIcon(block))}</span>${esc(block.prompt)}</div>`
    : ''
  const sub = block.subtext ? `<div class="anvil-subtext">${esc(block.subtext)}</div>` : ''
  const state = partial ? 'streaming' : 'preview'

  // Order matters: warnings explain the body, so they belong ABOVE the action
  // rather than orphaned underneath it.
  return `<section class="anvil-block" data-anvil-id="${esc(block.id)}" data-anvil-kind="${esc(block.kind)}">
    ${head}${sub}${body}${warnings(block)}${submitBar(block)}
    <footer class="anvil-foot"><span>${state}</span></footer>
  </section>`
}

/* ── card and board ──────────────────────────────────────────────────────── */

/**
 * The frame shared by @card and @board.
 *
 * The footer says `snapshot`, always. A card in a transcript is what the ticket
 * looked like when the sentence around it was written; a card that silently
 * re-renders today's state turns the transcript into a lie about what was on
 * screen when the human answered (§1). `as=` is the agent's timestamp, and this
 * renderer never substitutes a clock of its own -- it has no way to know
 * whether the data is fresh, and inventing a time would claim that it does.
 */
function recordShell(block: AnvilBlock, partial: boolean): string {
  const board = block.kind === 'board'
  const status = cardStatus(block)
  const type = attrString(block, 'type')
  const rawRef = block.derivedId ? '' : block.id
  const p = taskProgress(block)

  // `href=` is the one outbound affordance a card gets, and it earns it: the
  // first thing a human does with an agent-rendered ticket is try to click
  // through to the real one. Allowlisted like every other agent-authored URL
  // (§8.3), and it does NOT make the card interactive -- a link is navigation,
  // not an answer.
  const href = safeUrl(attrString(block, 'href'))
  const ref = rawRef
    ? href
      ? `<a class="anvil-ref anvil-ref-link" href="${esc(href)}" rel="noopener noreferrer">${esc(rawRef)}</a>`
      : `<span class="anvil-ref">${esc(rawRef)}</span>`
    : ''

  // A board is one thing made of many, so its header carries the total. A card
  // is one thing, so its header carries its own state.
  const right = board
    ? p.total > 0
      ? `<span class="anvil-card-count">${p.done}/${p.total} · ${p.pct}% done</span>`
      : ''
    : `<span class="anvil-status" data-state="${status}">${icon(STATE_ICON[status])}<span>${STATE_LABEL[status]}</span></span>`

  const head = `<header class="anvil-card-head">
    <span class="anvil-icon">${icon(blockIcon(block))}</span>
    ${board ? `<span class="anvil-card-title">${esc(block.prompt)}</span>` : ''}
    ${board ? '' : ref}
    ${!board && type ? `<span class="anvil-kindchip">${esc(type)}</span>` : ''}
    ${right}
  </header>`

  const heading = !board && block.prompt ? `<div class="anvil-card-title">${esc(block.prompt)}</div>` : ''
  const sub = block.subtext ? `<div class="anvil-subtext">${esc(block.subtext)}</div>` : ''
  const as = attrString(block, 'as')
  const foot = [partial ? 'streaming' : 'snapshot', as ? `as of ${as}` : ''].filter(Boolean).join(' · ')

  // A board has no single state -- that is the whole point of having lanes -- so
  // it does not claim one.
  return `<section class="anvil-block anvil-card-block" data-anvil-id="${esc(block.id)}" data-anvil-kind="${esc(block.kind)}"${board ? '' : ` data-state="${status}"`}>
    ${head}${heading}${sub}${(BODIES[block.kind] ?? renderNote)(block)}${warnings(block)}${submitBar(block)}
    <footer class="anvil-foot"><span>${esc(foot)}</span></footer>
  </section>`
}

/* ── message ─────────────────────────────────────────────────────────────── */

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  email: 'Email',
  memo: 'Message',
  whatsapp: 'WhatsApp',
  imessage: 'iMessage',
  sms: 'SMS',
  signal: 'Signal',
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
}

/** The pill on the frame. Short, because it is read at a glance, not parsed. */
const STATE_PILL: Record<MessageState, string> = {
  draft: 'draft &middot; not sent',
  approved: 'approved &middot; sending',
  sent: 'sent',
  failed: 'not sent',
  declined: 'declined',
}

const STATE_GLYPH: Record<MessageState, IconName> = {
  draft: 'circle',
  approved: 'circle-dot',
  sent: 'circle-check',
  failed: 'octagon-alert',
  declined: 'ban',
}

/** What the footer says happened, and when. */
const STATE_FOOT: Record<MessageState, string> = {
  draft: 'draft',
  approved: 'approved',
  sent: 'sent',
  failed: 'send failed',
  declined: 'declined',
}

/**
 * The frame for a proposed message.
 *
 * THE STATE MARKER IS THE POINT. A rendered email that looks exactly like a
 * sent email is the most dangerous thing this block can do: a human scrolling
 * back three screens must be able to tell, at a glance and without reading the
 * body, whether the thing actually went out. So every state past `draft` has to
 * be ASSERTED, and it is drawn on the frame rather than buried in the footer.
 *
 * `approved` exists for the same reason one step later. THE CLICK IS APPROVAL,
 * NOT DELIVERY -- a stamp records that a human said yes, and the send can still
 * fail afterwards. A block that flipped to `sent` on the click would be telling
 * the same lie three seconds further along.
 *
 * This is §1 arriving from a third direction. A transcript is a record of
 * things that happened; a draft that looks sent is a record of something that
 * did not.
 */
function messageShell(block: AnvilBlock, partial: boolean): string {
  const channel = messageChannel(block)
  const chrome = messageChrome(channel)
  const state = messageState(block)
  const locked = isLocked(state)
  const authored = attrString(block, 'channel').toLowerCase()

  if (authored && channel === 'memo') {
    block.warnings.push(`unknown channel "${authored}", drawn as a plain memo`)
  }

  const to = recipients(block, 'to')
  // A bubble has no envelope table, so the recipient has to live in the header
  // or it is simply not on screen anywhere.
  const peer = chrome === 'envelope' ? '' : to.join(', ') || attrString(block, 'from')

  const mark = `<span class="anvil-msg-state">${icon(STATE_GLYPH[state])}<span>${STATE_PILL[state]}</span></span>`

  const head = `<header class="anvil-card-head">
    <span class="anvil-icon">${icon(resolveIcon(block.attrs.icon, CHANNEL_ICON[channel]))}</span>
    <span class="anvil-kindchip">${esc(CHANNEL_LABEL[channel])}</span>
    ${peer ? `<span class="anvil-ref">${esc(peer)}</span>` : ''}
    ${mark}
  </header>`

  const subject = block.prompt ? `<div class="anvil-card-title">${esc(block.prompt)}</div>` : ''
  const sub = block.subtext ? `<div class="anvil-subtext">${esc(block.subtext)}</div>` : ''
  const when = messageAt(block) || attrString(block, 'as')
  const foot = [partial ? 'streaming' : STATE_FOOT[state], when ? `at ${when}` : ''].filter(Boolean).join(' · ')

  const danger = block.attrs.danger ? ' anvil-msg-danger' : ''

  return `<section class="anvil-block anvil-card-block anvil-msg anvil-msg-${chrome}${danger}" data-anvil-id="${esc(block.id)}" data-anvil-kind="message" data-channel="${esc(channel)}" data-state="${state}" data-locked="${locked ? 'yes' : 'no'}">
    ${head}${subject}${sub}${renderMessage(block)}${warnings(block)}${gateOrReceipt(block, state)}
    <footer class="anvil-foot"><span>${esc(foot)}</span></footer>
  </section>`
}

/**
 * The bottom of the block: a send gate before the stamp, the receipt of that
 * stamp afterwards.
 *
 * ONE ROW, TRANSFORMED -- never a row that vanishes. §9.2 requires a stamped
 * block to occupy exactly the height it did while open, and the gate is the
 * tallest thing on a message, so removing it would jump every pixel below it up
 * the page at the moment the human is looking for confirmation.
 *
 * It is also the §4.1 rule in a second place: a stamped choice keeps its
 * rejected rows because they are part of the record. A sent message keeps the
 * question it was asked, because "what exactly did the human approve" is what a
 * transcript is for.
 */
function gateOrReceipt(block: AnvilBlock, state: MessageState): string {
  const ask = attrString(block, 'ask')
  if (!ask) return ''

  if (state === 'draft') {
    return `<div class="anvil-msg-gate">
      <span class="anvil-prompt anvil-msg-ask"><span class="anvil-icon">${icon('send')}</span>${esc(ask)}</span>
      ${submitBar(block)}
    </div>`
  }

  const by = attrString(block, 'by')
  const when = messageAt(block)
  const detail = [by ? `by ${by}` : '', when ? `at ${when}` : ''].filter(Boolean).join(' · ')
  const error = state === 'failed' ? attrString(block, 'error') : ''

  return `<div class="anvil-msg-gate anvil-msg-receipt">
    <span class="anvil-prompt anvil-msg-ask">${icon(STATE_GLYPH[state])}${esc(ask)}</span>
    <span class="anvil-msg-answer">${STATE_PILL[state]}${detail ? ` <span class="anvil-msg-by">${esc(detail)}</span>` : ''}</span>
    ${error ? `<span class="anvil-msg-error">${esc(error)}</span>` : ''}
  </div>`
}

/* ── layout ──────────────────────────────────────────────────────────────── */

/** Gap is a keyword, never a raw length: three rhythms, not a design tool. */
const GAPS: Record<string, string> = {
  tight: '0.35rem',
  normal: '0.6rem',
  loose: '1rem',
}

/**
 * `min=` lands in a style attribute, so it is ALLOWLISTED rather than escaped,
 * the same rule `swatch` and `font` follow in blocks.ts.
 */
function safeLength(v: string): string | null {
  const t = v.trim()
  return /^\d{1,3}(\.\d{1,2})?(rem|em|px|ch)$/.test(t) ? t : null
}

/**
 * A container.
 *
 * No id, no submit, no footer, no interactive affordance of any kind: layout is
 * the one thing in ANVIL that cannot be answered, so it must not carry a single
 * pixel that suggests otherwise.
 *
 * There are no breakpoints here on purpose. The agent writing this fence cannot
 * see the screen, and the surface rendering it is as likely to be a 380px chat
 * column on a 5K display as a full page -- so a viewport media query would be
 * measuring the wrong box. `cols` is a MAXIMUM; the track formula in anvil.css
 * collapses against the container's own width.
 */
function layoutShell(block: AnvilBlock, partial: boolean): string {
  // pick(), not `?? fallback`: `gap=constructor` otherwise substitutes a
  // function's source text into the track formula and collapses the grid.
  const gap = pick(GAPS, attrString(block, 'gap', 'normal').toLowerCase(), GAPS.normal as string)
  const vars = [`--anvil-lgap:${gap}`]

  if (block.kind === 'grid') {
    vars.push(`--anvil-cols:${Math.max(1, Math.min(6, attrNumber(block, 'cols', 2)))}`)
    const min = safeLength(attrString(block, 'min'))
    if (min) vars.push(`--anvil-min:${min}`)
  }

  const title = block.prompt ? `<div class="anvil-layout-title">${esc(block.prompt)}</div>` : ''
  const framed = block.attrs.frame ? ' anvil-layout-framed' : ''
  const inner = block.children.map(c => renderBlock(c, partial)).join('')
  const shape = block.kind === 'grid' ? 'anvil-auto' : 'anvil-stack'

  return `<div class="anvil-layout${framed}" data-anvil-kind="${esc(block.kind)}">
    ${title}${warnings(block)}
    <div class="${shape}" style="${vars.join(';')}">${inner}</div>
  </div>`
}

/* ── dispatch ────────────────────────────────────────────────────────────── */

const SHELLS: Partial<Record<AnvilKind, (b: AnvilBlock, partial: boolean) => string>> = {
  card: recordShell,
  board: recordShell,
  message: messageShell,
  grid: layoutShell,
  stack: layoutShell,
}

function renderBlock(block: AnvilBlock, partial: boolean): string {
  return (SHELLS[block.kind] ?? shell)(block, partial)
}

/**
 * Entry point for the markdown renderer.
 *
 * `closed` is false while the fence is still streaming. A block whose last
 * option has not arrived yet must never look answerable, so a partial doc
 * renders with a streaming footer and (since every control is already inert in
 * this spike) no interaction at all.
 */
export function renderAnvilFence(source: string, closed: boolean): string {
  let doc: ReturnType<typeof parseAnvil>
  try {
    doc = parseAnvil(source, { partial: !closed })
  } catch (err) {
    // parseAnvil is total, so this is unreachable by contract. Belt and braces:
    // a transcript must never white-screen because an agent typed something odd.
    const why = err instanceof Error ? err.message : 'unknown'
    return `<div class="anvil-fallback"><div class="anvil-warn">anvil parse failed: ${esc(why)}</div><pre><code>${esc(source)}</code></pre></div>`
  }

  if (!doc.blocks.length) {
    return `<div class="anvil-fallback"><pre><code>${esc(source)}</code></pre></div>`
  }

  const inner = doc.blocks.map(b => renderBlock(b, doc.partial)).join('')
  return `<div class="anvil-doc${doc.partial ? ' anvil-doc-streaming' : ''}">${inner}</div>`
}
