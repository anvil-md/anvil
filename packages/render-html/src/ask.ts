/**
 * The answer half of a block, as far as a RENDERER goes (§6, §7).
 *
 * This package still never stores, sends or decides a stamp. §7.1 law II puts
 * the stamp on the server, and idempotency (§7.3) and the permission gate (§8.2)
 * live there with it. What a renderer does own is drawing every state the server
 * reports, because every host would otherwise redraw them differently: an open
 * block that can be answered, a pending one, and a stamped one that keeps its
 * rejected rows (law IV).
 *
 * A host that passes no `stamping` gets exactly the old display-only output,
 * every control `disabled`.
 */
import { type AnvilAnswer, type AnvilBlock, type AnvilStamp, isMulti } from '@anvil-md/parser'

/** What the server says happened to one block. */
export type BlockState =
  /** Answerable. `error` is the last refusal (§7.2: back to open, with an error strip). */
  | { state: 'open'; error?: string }
  /** Sent, not yet acknowledged. Never draw `stamped` optimistically (§7.2). */
  | { state: 'pending'; answer: AnvilAnswer }
  /** The record. Absorbing: nothing leaves it. */
  | { state: 'stamped'; stamp: AnvilStamp }

export interface AnvilStamping {
  /**
   * The state of a block, by id. `undefined` means the host does not know YET,
   * and the block renders inert rather than clickable (§7.6): a block that
   * flashes clickable-then-stamped on every reload trains people to click fast.
   */
  resolve: (blockId: string) => BlockState | undefined
  /** May this viewer stamp at all? The server enforces it; this only draws it (§8.2). */
  canStamp: boolean
  /** §8.2.1: the host-written line for a viewer who cannot answer. Never agent text. */
  waitingOn?: string
  /** How a stamp's `at=` reads. Default: the ISO minute, in UTC, said so. */
  formatAt?: (iso: string) => string
}

export type AskMode = 'display' | 'open' | 'pending' | 'stamped'

/** Everything one block's drawing depends on, decided once per block. */
export interface Ask {
  mode: AskMode
  /** The pending answer, or the stamp read back into an answer. Null when nothing was answered. */
  answer: AnvilAnswer | null
  /** A refusal to show above the submit button. */
  error: string
  /** The footer line. */
  foot: string
}

/** The kinds a stamp can be written for (`stampAnswer` in the parser). */
const STAMPABLE = new Set(['choice', 'gallery', 'input', 'scale'])

const DISPLAY: Ask = { mode: 'display', answer: null, error: '', foot: '' }

/** One block's state. `partial` wins over everything: a streaming block is never answerable (§5). */
export function askFor(block: AnvilBlock, partial: boolean, stamping: AnvilStamping | undefined): Ask {
  if (!stamping || partial || !STAMPABLE.has(block.kind) || !block.id) return DISPLAY
  const s = stamping.resolve(block.id)
  if (!s) return DISPLAY
  if (s.state === 'stamped') return { mode: 'stamped', answer: answerOf(s.stamp), error: '', foot: receipt(s.stamp, stamping) }
  if (s.state === 'pending') return { mode: 'pending', answer: s.answer, error: '', foot: 'sending' }
  if (!stamping.canStamp) return { ...DISPLAY, foot: stamping.waitingOn ?? '' }
  return { mode: 'open', answer: null, error: s.error ?? '', foot: 'open' }
}

/**
 * A stamp read back into the answer that produced it, so a stamped block draws
 * the same picks, values and notches the human chose. Attributes are the truth
 * (§6.1); the body sentence is never read.
 */
export function answerOf(stamp: AnvilStamp): AnvilAnswer {
  const attr = (k: string): string => stamp.attrs.find(([key]) => key === k)?.[1] ?? ''
  if (stamp.kind === 'input') {
    const fields: Record<string, string> = {}
    for (const c of stamp.children) if (c.name === 'field') fields[childAttr(c.attrs, 'name')] = c.text ?? ''
    return { kind: 'input', fields }
  }
  if (stamp.kind === 'scale') {
    const values: Record<string, number> = {}
    for (const c of stamp.children) if (c.name === 'dial') values[childAttr(c.attrs, 'name')] = Number(childAttr(c.attrs, 'value'))
    return { kind: 'scale', values }
  }
  const many = attr('values')
  return { kind: 'pick', values: many ? many.split(',') : [attr('value')].filter(Boolean) }
}

function childAttr(attrs: readonly (readonly [string, string])[], key: string): string {
  return attrs.find(([k]) => k === key)?.[1] ?? ''
}

/** `2026-11-23T14:04:51.120Z` -> `2026-11-23 14:04 UTC`. Says its zone rather than pretending to be local. */
function utcMinute(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso)
  return m ? `${m[1]} ${m[2]} UTC` : iso
}

function receipt(stamp: AnvilStamp, stamping: AnvilStamping): string {
  const attr = (k: string): string => stamp.attrs.find(([key]) => key === k)?.[1] ?? ''
  const by = attr('by')
  const at = attr('at')
  const when = at ? (stamping.formatAt ?? utcMinute)(at) : ''
  return ['answered', by ? `by ${by}` : '', when].filter(Boolean).join(' · ')
}

/** A control is live only while the block is open for this viewer. */
export function inert(ask: Ask | undefined): string {
  return ask?.mode === 'open' ? '' : ' disabled'
}

/** Was this row picked, in the pending answer or the stamp? */
export function isPicked(ask: Ask | undefined, value: string): boolean {
  return ask?.answer?.kind === 'pick' && ask.answer.values.includes(value)
}

/** The value an input field shows: what was sent or stamped, else nothing. */
export function fieldValue(ask: Ask | undefined, name: string): string | undefined {
  return ask?.answer?.kind === 'input' && Object.hasOwn(ask.answer.fields, name) ? ask.answer.fields[name] : undefined
}

/** The notch a dial sits at: the answered one, else the authored default. */
export function dialNotch(ask: Ask | undefined, name: string, fallback: number): number {
  if (ask?.answer?.kind !== 'scale' || !Object.hasOwn(ask.answer.values, name)) return fallback
  const n = ask.answer.values[name]
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

/** Where a notch sits on its track, as a percentage. Shared with the hydrator, which moves the knob. */
export function notchPct(notch: number, steps: number): string {
  const raw = ((notch - 1) / Math.max(1, steps - 1)) * 100
  return Math.min(100, Math.max(0, raw)).toFixed(1)
}

/** The section's state attributes. `data-anvil-interactive` is what the hydrator listens for. */
export function stateAttrs(block: AnvilBlock, ask: Ask): string {
  if (ask.mode === 'display') return ''
  const select = block.kind === 'choice' || block.kind === 'gallery' ? ` data-select="${isMulti(block) ? 'many' : 'one'}"` : ''
  return ` data-stamp-state="${ask.mode}"${select}${ask.mode === 'open' ? ' data-anvil-interactive' : ''}`
}
