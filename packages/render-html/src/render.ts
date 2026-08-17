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
  type GalleryRender,
  galleryRender,
  parseAnvil,
} from '@anvil-md/parser'
import { esc, renderChoice, renderGallery, renderInput, renderNote, renderScale, submitBar, warnings } from './blocks'
import { type IconName, icon, resolveIcon } from './icons'

type BodyRenderer = (block: AnvilBlock) => string

/** Strategy map, not a switch chain: a new kind is one entry plus one renderer. */
const BODIES: Record<AnvilKind, BodyRenderer> = {
  choice: renderChoice,
  gallery: renderGallery,
  input: renderInput,
  scale: renderScale,
  note: renderNote,
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
}

/** A gallery's icon follows what its cards actually show. */
const GALLERY_ICON: Record<GalleryRender, IconName> = {
  image: 'images',
  swatch: 'palette',
  type: 'type',
  card: 'layout-grid',
}

function blockIcon(block: AnvilBlock): IconName {
  const base = block.kind === 'gallery' ? GALLERY_ICON[galleryRender(block)] : KIND_ICON[block.kind]
  return resolveIcon(block.attrs.icon, base)
}

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

  const inner = doc.blocks.map(b => shell(b, doc.partial)).join('')
  return `<div class="anvil-doc${doc.partial ? ' anvil-doc-streaming' : ''}">${inner}</div>`
}
