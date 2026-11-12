/**
 * The bridge: an A2UI renderer on one side, an ANVIL transcript on the other.
 *
 * It exports a fence as surfaces, and turns the renderer's `anvil.stamp`
 * actions back into stamps. The renderer is untrusted (§8.1): whatever it
 * sends is judged by `stampAnswer` against the block, never taken on its word.
 *
 * What A2UI does not have, the bridge enforces:
 *
 * - ONE STAMP PER BLOCK (§7.1, law III). A2UI surfaces stay live after an
 *   action. The second action on a block is refused, not queued and not
 *   overwritten, and the surface is frozen so there is nothing left to press.
 * - THE OFFER IS THE RECORD (§4.1.2). A live block's rows are fixed at export;
 *   a value outside them is refused, and the stamp carries them.
 * - WHO answered comes from the host, never from the renderer's payload.
 *
 * One bridge holds one fence. Its stamped set is in memory: a host that must
 * survive a restart keeps the stamps (law II says the server does) and
 * replays them with `restore`.
 */
import {
  type AnvilAnswer,
  type AnvilBlock,
  isMulti,
  type StampOptions,
  stampAnswer,
  stampXml,
} from '@anvil-md/parser'
import { type ExportOptions, type Slot, type Surface, toA2UI } from './export'
import { frozenComponents } from './freeze'
import { type A2UIMessage, STAMP_EVENT } from './types'

export type BridgeReply =
  | { ok: true; block: string; stamp: string; messages: A2UIMessage[] }
  | { ok: false; refused: string; messages: A2UIMessage[] }

export class A2UIBridge {
  readonly surfaces: Surface[]
  readonly warnings: string[]
  private readonly stamped = new Set<string>()

  constructor(source: string, opts: ExportOptions = {}) {
    const out = toA2UI(source, opts)
    this.surfaces = out.surfaces
    this.warnings = out.warnings
  }

  /** What to send the renderer first: one `createSurface` per block. */
  get messages(): A2UIMessage[] {
    return this.surfaces.map(s => s.message)
  }

  isStamped(blockId: string): boolean {
    return this.stamped.has(blockId)
  }

  /** A renderer's action message. `by` is who the HOST says is acting. */
  receive(message: unknown, host: { by?: string } = {}): BridgeReply {
    const action = readAction(message)
    if (typeof action === 'string') return refuse(action)
    const surface = this.surfaces.find(s => s.surfaceId === action.surfaceId)
    if (!surface) return refuse(`no surface "${action.surfaceId}"`)
    // The block must be on the surface the action came from: a renderer cannot
    // reach across surfaces by naming another block in the context.
    const slot = surface.slots.find(s => s.block.id === action.block)
    if (!slot) return refuse(`no answerable block "${action.block}" on ${surface.surfaceId}`)
    if (this.stamped.has(slot.block.id)) {
      return refuse(`"${slot.block.id}" is already stamped; a block is answered once (§7.1, law III)`)
    }
    const answer = readAnswer(slot.block, action.context)
    if (typeof answer === 'string') return refuse(answer)

    const opts: StampOptions = { at: action.timestamp }
    if (host.by) opts.by = host.by
    if (slot.offer) opts.offered = slot.offer
    const result = stampAnswer(slot.block, answer, opts)
    if (!result.ok) return refuse(result.refused)
    this.stamped.add(slot.block.id)
    return {
      ok: true,
      block: slot.block.id,
      stamp: stampXml(result.stamp),
      messages: [{ version: '1.0', updateComponents: { surfaceId: surface.surfaceId, components: frozenComponents(slot, result.stamp) } }],
    }
  }

  /** Marks blocks the server already holds stamps for, after a restart. */
  restore(blockIds: Iterable<string>): void {
    for (const id of blockIds) this.stamped.add(id)
  }

  /** Every slot, across surfaces. */
  get slots(): Slot[] {
    return this.surfaces.flatMap(s => s.slots)
  }
}

function refuse(reason: string): BridgeReply {
  return { ok: false, refused: reason, messages: [] }
}

interface ReadAction {
  surfaceId: string
  block: string
  timestamp: string
  context: Record<string, unknown>
}

/** The action envelope, read field by field. A string is the reason it was refused. */
function readAction(message: unknown): ReadAction | string {
  const m = record(message)
  if (!m || m.version !== '1.0') return 'not an A2UI v1.0 message'
  const a = record(m.action)
  if (!a) return 'not an action'
  if (a.name !== STAMP_EVENT) return `"${String(a.name)}" is not an ${STAMP_EVENT} action`
  const context = record(a.context)
  if (typeof a.surfaceId !== 'string' || !context || typeof context.block !== 'string') return 'the action names no block'
  const timestamp = typeof a.timestamp === 'string' && !Number.isNaN(Date.parse(a.timestamp)) ? a.timestamp : ''
  if (!timestamp) return 'the action carries no timestamp'
  return { surfaceId: a.surfaceId, block: context.block, timestamp, context }
}

/** The context, as the answer its block takes. */
function readAnswer(b: AnvilBlock, c: Record<string, unknown>): AnvilAnswer | string {
  if (b.kind === 'choice' || b.kind === 'gallery') {
    if (!isMulti(b)) return typeof c.value === 'string' ? { kind: 'pick', values: [c.value] } : 'the action names no row'
    const values = c.values
    if (!Array.isArray(values) || !values.every(v => typeof v === 'string')) return 'the action names no rows'
    return { kind: 'pick', values }
  }
  if (b.kind === 'input') {
    const raw = record(c.fields)
    if (!raw) return 'the action carries no fields'
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') fields[k] = v
      else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) fields[k] = String(v)
      else if (v !== null && v !== undefined) return `${k} is not a value`
    }
    return { kind: 'input', fields }
  }
  if (b.kind === 'scale') {
    const raw = record(c.dials)
    if (!raw) return 'the action carries no dials'
    const values: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== 'number') return `${k} is not a number`
      values[k] = v
    }
    return { kind: 'scale', values }
  }
  return `@${b.kind} is not answered through A2UI`
}

/** A plain object, own keys only, or null. */
function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
