/**
 * A stamped block, as an A2UI `updateComponents`.
 *
 * Every control is REPLACED by text under its own id: a Button becomes the
 * row it was, a ChoicePicker becomes the list it offered, a TextField becomes
 * the value it held. The submit button leaves the tree. So the frozen surface
 * has nothing left to press, whatever the renderer does with a stale tap, and
 * the rejected rows stay on screen because they are the record (§7.1, law IV).
 * The bridge refuses a second action anyway (law III); this is what makes the
 * refusal visible instead of a button that silently does nothing.
 */
import { type AnvilOption, type AnvilStamp, attrNumber, isMulti } from '@anvil-md/parser'
import type { Slot } from './export'
import { md } from './text'
import type { Component } from './types'

export function frozenComponents(slot: Slot, stamp: AnvilStamp): Component[] {
  const { block: b, scope: s } = slot
  const out: Component[] = []
  const attr = (k: string) => stamp.attrs.find(([key]) => key === k)?.[1]

  if (b.kind === 'choice' || b.kind === 'gallery') {
    const picked = new Set((attr('value') ?? attr('values') ?? '').split(',').filter(Boolean))
    if (attr('value') !== undefined) picked.add(attr('value') ?? '')
    if (isMulti(b)) {
      const rows = slot.rows.map((row, i) => recordRow(`${s}_x${i}`, row, picked.has(row.value)))
      out.push(...rows, { id: `${s}_pick`, component: 'Column', children: rows.map(r => r.id) })
    } else {
      out.push(...slot.rows.map((row, i) => recordRow(`${s}_r${i}`, row, picked.has(row.value))))
    }
  } else if (b.kind === 'input') {
    b.fields.forEach((f, i) => {
      const held = stamp.children.find(c => c.name === 'field' && c.attrs.some(([k, v]) => k === 'name' && v === f.name))
      out.push({ id: `${s}_f${i}`, component: 'Text', text: `**${md(f.label)}**: ${held?.text ? md(held.text) : '—'}` })
    })
  } else if (b.kind === 'scale') {
    const steps = attrNumber(b, 'steps', 5)
    b.dials.forEach((d, i) => {
      const dial = stamp.children.find(c => c.name === 'dial' && c.attrs.some(([k, v]) => k === 'name' && v === d.name))
      const n = dial?.attrs.find(([k]) => k === 'value')?.[1] ?? String(d.value)
      out.push({ id: `${s}_d${i}`, component: 'Text', text: `**${md(d.name)}**: ${n} of ${steps}, ${md(d.left)} to ${md(d.right)}` })
    })
  }

  const when = [attr('by'), attr('at')].filter(Boolean).join(' · ')
  const footer = `${s}_stamped`
  out.push({ id: footer, component: 'Text', text: md(when ? `Stamped · ${when}` : 'Stamped'), variant: 'caption' })
  out.push({ id: slot.bodyId, component: 'Column', children: [...slot.head, ...slot.controls, footer] })
  return out
}

/** A row as it stands in the record: the picked one marked in words, not only a glyph. */
function recordRow(id: string, row: AnvilOption, picked: boolean): Component {
  const words = row.hint ? `${md(row.label)} · ${md(row.hint)}` : md(row.label)
  return {
    id,
    component: 'Text',
    text: picked ? `✓ **${words}**` : words,
    variant: picked ? 'body' : 'caption',
    '@accessibility': { label: `${row.alt || row.label}, ${picked ? 'picked' : 'not picked'}` },
  }
}
