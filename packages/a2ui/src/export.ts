/**
 * ANVIL to A2UI v1.0 (basic catalog).
 *
 * One SURFACE per top-level block, because a stamp is keyed by block and a
 * surface is what an A2UI renderer creates, updates and deletes as a unit. A
 * `@grid` or `@stack` keeps its children on its own surface.
 *
 * What maps, and how:
 *
 *   @choice / @gallery select=one   one Button per row; the click stamps (§9.12)
 *   @choice / @gallery select=many  ChoicePicker + a submit Button
 *   @input                          TextField / CheckBox / DateTimeInput, with
 *                                   the field's checks as `@checks` (checks.ts)
 *   @scale                          one Slider per dial + a submit Button
 *   @note                           Text, markdown body
 *   @grid / @stack                  Column
 *   everything else                 Text, and a warning naming what was lost
 *
 * Every control dispatches ONE event, `anvil.stamp`, whose context names the
 * block. The bridge (bridge.ts) turns that into a stamp and refuses the second
 * one. Nothing here is parsed and then dropped in silence (§11): anything the
 * basic catalog cannot draw is said in `warnings`.
 */
import {
  type AnvilBlock,
  type AnvilOption,
  attrNumber,
  attrString,
  blockA11y,
  galleryRender,
  isContainer,
  isMulti,
  liveSource,
  optionAlt,
  parseAnvil,
  recommended,
  safeUrl,
} from '@anvil-md/parser'
import { fieldChecks } from './checks'
import { md, ptr } from './text'
import { type A11yAttributes, type A2UIMessage, BASIC_CATALOG, type CheckRule, type Component, STAMP_EVENT } from './types'

/** §4.1.2: the rows a host function returned for a block, before export. */
export interface Offer {
  fn: string
  rows: AnvilOption[]
}

export interface ExportOptions {
  /** Surface ids must be unique for the renderer's lifetime; a message id is a good prefix. */
  surfacePrefix?: string
  /** Live rows, keyed by block id. A block with `query=` and no offer shows its written rows. */
  offered?: Record<string, Offer>
}

/** One answerable block on a surface, and everything the bridge needs to stamp and freeze it. */
export interface Slot {
  block: AnvilBlock
  scope: string
  /** The rows the human is shown: the offer's, else the written ones. */
  rows: AnvilOption[]
  offer?: Offer
  bodyId: string
  /** Prompt and subtext ids, kept when the block freezes. */
  head: string[]
  /** The control ids that freeze in place. */
  controls: string[]
}

export interface Surface {
  surfaceId: string
  slots: Slot[]
  message: A2UIMessage
}

export interface ExportResult {
  surfaces: Surface[]
  warnings: string[]
}

export function toA2UI(source: string, opts: ExportOptions = {}): ExportResult {
  const doc = parseAnvil(source)
  const warnings: string[] = []
  const surfaces: Surface[] = []
  const used = new Set<string>()
  for (const block of doc.blocks) {
    const base = `${opts.surfacePrefix ?? 'anvil_'}${(block.id || 'layout').replace(/[^A-Za-z0-9_]/g, '_')}`
    let surfaceId = base
    for (let n = 2; used.has(surfaceId); n++) surfaceId = `${base}_${n}`
    used.add(surfaceId)
    const build = new Build(warnings, opts)
    build.block(block, 'root')
    surfaces.push({
      surfaceId,
      slots: build.slots,
      message: {
        version: '1.0',
        createSurface: { surfaceId, catalogId: BASIC_CATALOG, components: build.components, dataModel: build.data },
      },
    })
  }
  return { surfaces, warnings }
}

class Build {
  readonly components: Component[] = []
  readonly data: Record<string, unknown> = {}
  readonly slots: Slot[] = []
  private scopes = 0

  constructor(
    private readonly warnings: string[],
    private readonly opts: ExportOptions,
  ) {}

  /** Draws `b` and returns the id of its outermost component. */
  block(b: AnvilBlock, id: string): string {
    const s = `b${this.scopes++}`
    const outer = id === 'root' ? 'root' : `${s}_card`
    if (isContainer(b.kind)) {
      if (b.kind === 'grid') this.warn(b, 'a @grid is drawn as a column; the basic catalog has no row that wraps')
      const children = b.children.map(child => this.block(child, ''))
      this.add({ id: outer, component: 'Column', children })
      return outer
    }
    const head = this.head(b, s)
    let controls: string[]
    let tail: string[] = []
    if (b.kind === 'choice' || b.kind === 'gallery') [controls, tail] = this.pick(b, s, head)
    else if (b.kind === 'input') [controls, tail] = this.input(b, s, head)
    else if (b.kind === 'scale') [controls, tail] = this.scale(b, s, head)
    else controls = this.show(b, s)
    const bodyId = `${s}_body`
    this.add({ id: bodyId, component: 'Column', children: [...head, ...controls, ...tail] })
    this.add({ id: outer, component: 'Card', child: bodyId, ...a11y(b) })
    return outer
  }

  private head(b: AnvilBlock, s: string): string[] {
    const ids: string[] = []
    if (b.prompt) ids.push(this.text(`${s}_prompt`, `**${md(b.prompt)}**`))
    if (b.subtext) ids.push(this.text(`${s}_sub`, md(b.subtext), 'caption'))
    return ids
  }

  /** @choice and @gallery. Returns [controls, tail]. */
  private pick(b: AnvilBlock, s: string, head: string[]): [string[], string[]] {
    const source = liveSource(b)
    const offer = source ? this.opts.offered?.[b.id] : undefined
    if (source && !offer) this.warn(b, `query=${source.fn} was not resolved; the written rows are offered`)
    const rows = offer?.rows ?? b.options
    const mark = recommended(b)
    const marked = mark && rows.some(r => r.value === mark) ? mark : undefined
    const slot: Slot = { block: b, scope: s, rows, bodyId: `${s}_body`, head, controls: [] }
    if (offer) slot.offer = offer
    this.slots.push(slot)
    const images = b.kind === 'gallery' && galleryRender(b) === 'image'
    if (b.kind === 'gallery' && !images) this.warn(b, `render=${galleryRender(b)} is drawn as labels; the basic catalog has no swatch or type specimen`)

    if (!isMulti(b)) {
      const buttons = rows.map((row, i) => {
        const id = `${s}_r${i}`
        const parts: string[] = []
        const url = images && row.img ? safeUrl(row.img) : null
        if (url) parts.push(this.add({ id: `${id}_img`, component: 'Image', url, description: optionAlt(row) }))
        parts.push(this.text(`${id}_l`, md(row.label)))
        if (row.hint) parts.push(this.text(`${id}_h`, md(row.hint), 'caption'))
        if (row.value === marked) parts.push(this.text(`${id}_rec`, 'recommended', 'caption'))
        this.add({ id: `${id}_c`, component: 'Column', children: parts })
        const button: Component = {
          id,
          component: 'Button',
          child: `${id}_c`,
          action: { event: { name: STAMP_EVENT, context: { block: b.id, value: row.value } } },
        }
        if (row.alt) button['@accessibility'] = { label: row.alt }
        return this.add(button)
      })
      slot.controls = [this.add({ id: `${s}_rows`, component: 'Column', children: buttons })]
      return [slot.controls, []]
    }

    if (images && rows.some(r => r.img)) this.warn(b, 'select=many shows labels only; the ChoicePicker draws no images')
    const path = `/${s}/picked`
    this.data[s] = { picked: [] }
    const picker = this.add({
      id: `${s}_pick`,
      component: 'ChoicePicker',
      variant: 'multipleSelection',
      options: rows.map(r => ({ label: r.hint ? `${r.label} · ${r.hint}` : r.label, value: r.value })),
      value: { '@path': path },
    })
    slot.controls = [picker]
    const submit = this.submit(b, s, { values: { '@path': path } }, [{ condition: { '@call': 'required', args: { value: { '@path': path } } } }])
    return [slot.controls, [submit]]
  }

  private input(b: AnvilBlock, s: string, head: string[]): [string[], string[]] {
    const fields: Record<string, unknown> = {}
    this.data[s] = { fields }
    const all: CheckRule[] = []
    const controls = b.fields.map((f, i) => {
      const path = `/${s}/fields/${ptr(f.name)}`
      const checks = fieldChecks(f, path)
      all.push(...checks)
      const c: Component = { id: `${s}_f${i}`, component: 'TextField', label: f.label, value: { '@path': path } }
      if (f.type === 'bool') {
        c.component = 'CheckBox'
        fields[f.name] = false
      } else if (f.type === 'date') {
        Object.assign(c, { component: 'DateTimeInput', enableDate: true, enableTime: false })
        if (f.checks.min) c.min = f.checks.min
        if (f.checks.max) c.max = f.checks.max
        fields[f.name] = ''
      } else {
        c.variant = f.type === 'longtext' ? 'longText' : f.type === 'number' ? 'number' : f.type === 'secret' ? 'obscured' : 'shortText'
        if (f.placeholder) c.placeholder = f.placeholder
        fields[f.name] = ''
      }
      if (checks.length) c['@checks'] = checks
      return this.add(c)
    })
    this.slots.push({ block: b, scope: s, rows: [], bodyId: `${s}_body`, head, controls })
    const gate: CheckRule[] =
      all.length > 1 ? [{ condition: { '@call': 'and', args: { values: all.map(r => r.condition) } } }] : all
    return [controls, [this.submit(b, s, { fields: { '@path': `/${s}/fields` } }, gate)]]
  }

  private scale(b: AnvilBlock, s: string, head: string[]): [string[], string[]] {
    const steps = attrNumber(b, 'steps', 5)
    const dials: Record<string, number> = {}
    this.data[s] = { dials }
    const controls = b.dials.map((d, i) => {
      dials[d.name] = d.value
      return this.add({
        id: `${s}_d${i}`,
        component: 'Slider',
        label: `${d.name}: ${d.left} to ${d.right}`,
        min: 1,
        max: steps,
        steps: steps - 1,
        value: { '@path': `/${s}/dials/${ptr(d.name)}` },
      })
    })
    this.slots.push({ block: b, scope: s, rows: [], bodyId: `${s}_body`, head, controls })
    return [controls, [this.submit(b, s, { dials: { '@path': `/${s}/dials` } }, [])]]
  }

  /** A block that asks nothing the basic catalog can ask: drawn as its words. */
  private show(b: AnvilBlock, s: string): string[] {
    if (b.kind === 'note') return b.prose ? [this.text(`${s}_text`, b.prose)] : []
    const lines = [
      ...b.options.map(o => `- ${md(o.label)}`),
      ...b.tasks.map(t => `- [${t.state === 'done' ? 'x' : ' '}] ${md(t.label)}`),
      ...b.data.map(d => `- ${md(d.label)}: ${md(d.raw)}`),
    ]
    if (b.prose) lines.push(md(b.prose))
    const asks = attrString(b, 'ask') !== ''
    this.warn(b, `@${b.kind} has no basic-catalog equivalent; it is drawn as text${asks ? ' and cannot be answered through A2UI' : ''}`)
    return lines.length ? [this.text(`${s}_text`, lines.join('\n'))] : []
  }

  private submit(b: AnvilBlock, s: string, context: Record<string, unknown>, checks: CheckRule[]): string {
    const label = this.text(`${s}_submit_l`, md(attrString(b, 'submit') || 'Submit'))
    const button: Component = {
      id: `${s}_submit`,
      component: 'Button',
      variant: 'primary',
      child: label,
      action: { event: { name: STAMP_EVENT, context: { block: b.id, ...context } } },
    }
    if (checks.length) button['@checks'] = checks
    return this.add(button)
  }

  private text(id: string, text: string, variant?: 'caption'): string {
    return this.add(variant ? { id, component: 'Text', text, variant } : { id, component: 'Text', text })
  }

  private add(c: Component): string {
    this.components.push(c)
    return c.id
  }

  private warn(b: AnvilBlock, what: string): void {
    this.warnings.push(`${b.id || `@${b.kind}`}: ${what}`)
  }
}

/** §9.13 to A2UI `@accessibility`: only what was authored or is not the default. */
function a11y(b: AnvilBlock): { '@accessibility'?: A11yAttributes } {
  const a = blockA11y(b)
  const out: A11yAttributes = {}
  if (attrString(b, 'alt').trim()) out.label = a.label
  if (attrString(b, 'desc').trim()) out.description = a.description
  if (a.live !== 'off') out.live = a.live
  if (a.hidden) out.hidden = true
  return Object.keys(out).length ? { '@accessibility': out } : {}
}
