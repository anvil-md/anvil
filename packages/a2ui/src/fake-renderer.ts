/**
 * TEST SUPPORT, not exported. The smallest A2UI renderer that can drive the
 * bridge: it applies `createSurface` and `updateComponents`, holds the data
 * model, resolves `@path` bindings in an action's context, and presses only
 * a Button that is reachable from `root` -- so a frozen surface really has
 * nothing left to press.
 */
import { type A2UIAction, type A2UIMessage, type Component, STAMP_EVENT } from './types'

export class FakeRenderer {
  readonly surfaceId: string
  private readonly components = new Map<string, Component>()
  private data: Record<string, unknown>

  constructor(create: A2UIMessage) {
    if (!('createSurface' in create)) throw new Error('not a createSurface')
    this.surfaceId = create.createSurface.surfaceId
    this.data = structuredClone(create.createSurface.dataModel)
    for (const c of create.createSurface.components) this.components.set(c.id, c)
  }

  apply(messages: A2UIMessage[]): void {
    for (const m of messages) {
      if ('updateComponents' in m && m.updateComponents.surfaceId === this.surfaceId) {
        for (const c of m.updateComponents.components) this.components.set(c.id, c)
      }
    }
  }

  /** Every component id reachable from `root`, depth first. */
  reachable(): Component[] {
    const out: Component[] = []
    const walk = (id: string): void => {
      const c = this.components.get(id)
      if (!c || out.includes(c)) return
      out.push(c)
      const kids = [c.child, ...(Array.isArray(c.children) ? c.children : [])]
      for (const k of kids) if (typeof k === 'string') walk(k)
    }
    walk('root')
    return out
  }

  /** What a human typing or toggling does: writes the data model. */
  set(path: string, value: unknown): void {
    const keys = segments(path)
    let at: Record<string, unknown> = this.data
    for (const k of keys.slice(0, -1)) {
      if (typeof at[k] !== 'object' || at[k] === null) at[k] = {}
      at = at[k] as Record<string, unknown>
    }
    at[keys[keys.length - 1] ?? ''] = value
  }

  get(path: string): unknown {
    let at: unknown = this.data
    for (const k of segments(path)) at = at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined
    return at
  }

  /** Presses a Button, and returns the action a renderer would send. */
  press(id: string, timestamp = '2026-11-12T14:02:00Z'): A2UIAction {
    const c = this.reachable().find(x => x.id === id)
    if (!c || c.component !== 'Button') throw new Error(`${id} is not a button on screen`)
    const event = (c.action as { event: { name: string; context: Record<string, unknown> } }).event
    const context: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(event.context)) {
      context[k] = v && typeof v === 'object' && '@path' in v ? this.get(String((v as { '@path': string })['@path'])) : v
    }
    return { version: '1.0', action: { name: event.name ?? STAMP_EVENT, surfaceId: this.surfaceId, sourceComponentId: id, timestamp, context } }
  }
}

function segments(path: string): string[] {
  return path
    .split('/')
    .slice(1)
    .map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))
}
