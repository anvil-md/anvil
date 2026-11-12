/**
 * @anvil-md/a2ui -- ANVIL blocks as A2UI v1.0 surfaces, and A2UI actions back
 * as frozen ANVIL stamps.
 *
 * `toA2UI` is the one-way export. `A2UIBridge` is the round trip: it exports,
 * judges each renderer action against its block, writes the stamp, refuses a
 * second one, and freezes the surface.
 */
export { A2UIBridge } from './bridge'
export type { BridgeReply } from './bridge'
export { a2uiSafe, fieldChecks } from './checks'
export { toA2UI } from './export'
export type { ExportOptions, ExportResult, Offer, Slot, Surface } from './export'
export { frozenComponents } from './freeze'
export { BASIC_CATALOG, STAMP_EVENT } from './types'
export type { A11yAttributes, A2UIAction, A2UIMessage, CheckRule, Component } from './types'
