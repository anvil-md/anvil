/**
 * The browser half of an open block: turn clicks and keys into an AnvilAnswer.
 *
 * ONE set of delegated listeners on a root the host owns, never one per block.
 * A transcript re-renders its markdown all the time -- every streamed token, a
 * stamp arriving, a theme change -- and per-element listeners would have to be
 * re-attached after each of those. Delegation survives any innerHTML swap.
 *
 * The hydrator never stamps. It collects what the human did and hands it to
 * `onAnswer`; the host sends it to its server, which checks it against the block
 * (`stampAnswer` in @anvil-md/parser, §8.1) and decides. The block only changes
 * when the host re-renders it with the state the server reported.
 *
 *   const detach = attachAnvil(transcriptEl, {
 *     onAnswer: (blockId, answer) => server.stamp(blockId, answer),
 *   })
 */
import type { AnvilAnswer } from '@anvil-md/parser'
import { notchPct } from './ask'

export interface AnvilHandlers {
  /** A complete answer for one block. Called once per deliberate act; never on a toggle. */
  onAnswer: (blockId: string, answer: AnvilAnswer, block: HTMLElement) => void
}

const OPEN = '.anvil-block[data-anvil-interactive]'

function openBlock(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(OPEN) : null
}

/** Array.from, not spread: a host's tsconfig may leave out DOM.Iterable. */
function all<T extends Element>(block: HTMLElement, selector: string): T[] {
  return Array.from(block.querySelectorAll<T>(selector))
}

function rows(block: HTMLElement): HTMLElement[] {
  return all<HTMLElement>(block, '[data-anvil-value]')
}

/** What the submit button means, per kind. The click on a single-select row never gets here. */
const COLLECT: Record<string, (block: HTMLElement) => AnvilAnswer | null> = {
  choice: pickedRows,
  gallery: pickedRows,
  input: block => {
    const fields: Record<string, string> = {}
    for (const el of all<HTMLInputElement | HTMLTextAreaElement>(block, '.anvil-input[name]')) {
      // Native constraint validation for what the browser understands
      // (required, min/max length); `pattern=` is the server's (§4.3.1).
      if (!el.checkValidity()) {
        el.reportValidity()
        return null
      }
      fields[el.name] = el.value
    }
    for (const sw of all<HTMLElement>(block, '[role="switch"][data-anvil-field]')) {
      fields[sw.dataset.anvilField ?? ''] = sw.getAttribute('aria-checked') === 'true' ? 'true' : 'false'
    }
    return { kind: 'input', fields }
  },
  scale: block => {
    const values: Record<string, number> = {}
    for (const r of all<HTMLInputElement>(block, 'input.anvil-range[name]')) values[r.name] = Number(r.value)
    return { kind: 'scale', values }
  },
}

function pickedRows(block: HTMLElement): AnvilAnswer {
  return { kind: 'pick', values: rows(block).filter(r => r.getAttribute('aria-pressed') === 'true').map(r => r.dataset.anvilValue ?? '') }
}

function answer(block: HTMLElement, a: AnvilAnswer | null, h: AnvilHandlers): void {
  const id = block.dataset.anvilId
  if (a && id) h.onAnswer(id, a, block)
}

/** A row on select=one IS the answer; on select=many it is a toggle until submit. */
function pressRow(block: HTMLElement, row: HTMLElement, h: AnvilHandlers): void {
  if (block.dataset.select === 'many') {
    row.setAttribute('aria-pressed', row.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')
    return
  }
  answer(block, { kind: 'pick', values: [row.dataset.anvilValue ?? ''] }, h)
}

function submit(block: HTMLElement, h: AnvilHandlers): void {
  const collect = COLLECT[block.dataset.anvilKind ?? '']
  if (collect) answer(block, collect(block), h)
}

function flip(sw: HTMLElement): void {
  sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') === 'true' ? 'false' : 'true')
}

function onClick(e: Event, h: AnvilHandlers): void {
  const block = openBlock(e.target)
  if (!block || !(e.target instanceof Element)) return
  const row = e.target.closest<HTMLElement>('[data-anvil-value]')
  if (row && !row.hasAttribute('disabled')) return pressRow(block, row, h)
  if (e.target.closest('[data-anvil-submit]')) return submit(block, h)
  const sw = e.target.closest<HTMLElement>('[role="switch"][data-anvil-field]')
  if (sw) flip(sw)
}

/**
 * §9.6: 1-9 pick the nth row, Enter submits, Escape does nothing -- there is
 * nothing to dismiss, and people press it reflexively. Space on a switch flips
 * it, as on any native toggle.
 */
function onKey(e: KeyboardEvent, h: AnvilHandlers): void {
  const block = openBlock(e.target)
  if (!block || !(e.target instanceof Element)) return
  if (e.target.matches('input, textarea')) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault()
      submit(block, h)
    }
    return
  }
  const sw = e.target.closest<HTMLElement>('[role="switch"][data-anvil-field]')
  if (sw && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault()
    flip(sw)
    return
  }
  const n = /^[1-9]$/.test(e.key) ? Number(e.key) : 0
  const row = n ? rows(block)[n - 1] : undefined
  if (row) {
    e.preventDefault()
    pressRow(block, row, h)
  } else if (e.key === 'Enter' && block.querySelector('[data-anvil-submit]') && !e.target.closest('button')) {
    e.preventDefault()
    submit(block, h)
  }
}

/** A dial's knob follows its range input. */
function onInput(e: Event): void {
  const r = e.target
  if (!(r instanceof HTMLInputElement) || !r.classList.contains('anvil-range') || !openBlock(r)) return
  const knob = r.parentElement?.querySelector<HTMLElement>('.anvil-knob')
  if (knob) knob.style.left = `${notchPct(Number(r.value), Number(r.max))}%`
}

/** Listen on `root` for every open block inside it, now and after any re-render. Returns the detach. */
export function attachAnvil(root: HTMLElement, h: AnvilHandlers): () => void {
  const click = (e: Event): void => onClick(e, h)
  const key = (e: Event): void => onKey(e as KeyboardEvent, h)
  root.addEventListener('click', click)
  root.addEventListener('keydown', key)
  root.addEventListener('input', onInput)
  return () => {
    root.removeEventListener('click', click)
    root.removeEventListener('keydown', key)
    root.removeEventListener('input', onInput)
  }
}
