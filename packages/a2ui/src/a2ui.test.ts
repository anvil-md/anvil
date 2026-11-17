/**
 * The round trip, driven the way a renderer drives it: export, press, read
 * the stamp, press again. Every action goes through FakeRenderer, which only
 * presses what is on screen, so "frozen" means frozen.
 */
import { describe, expect, test } from 'bun:test'
import { liveRows } from '@anvil-md/parser'
import { A2UIBridge } from './bridge'
import { a2uiSafe, fieldChecks } from './checks'
import { toA2UI } from './export'
import { FakeRenderer } from './fake-renderer'
import type { Component } from './types'

const AT = '2026-11-12T14:02:00Z'

function open(source: string, opts?: ConstructorParameters<typeof A2UIBridge>[1]) {
  const bridge = new A2UIBridge(source, opts)
  const first = bridge.surfaces[0]
  if (!first) throw new Error('no surface')
  return { bridge, r: new FakeRenderer(first.message), surface: first }
}

function onScreen(r: FakeRenderer, kind: string): Component[] {
  return r.reachable().filter(c => c.component === kind)
}

const KIND = `@choice id=project-kind
? What are we actually building?
- site    | Marketing site     | pages, no login
- product | Product UI         | accounts, state, real users
- !scrap  | Start from scratch | we bin the existing brand`

describe('@choice select=one: the click is the signature', () => {
  test('a press stamps the row, by whoever the host says, and freezes the block', () => {
    const { bridge, r } = open(KIND)
    const reply = bridge.receive(r.press('b0_r1', AT), { by: 'Ana' })
    expect(reply.ok).toBe(true)
    if (!reply.ok) return
    expect(reply.stamp).toBe(
      '<stamp block="project-kind" kind="choice" value="product" label="Product UI" at="2026-11-12T14:02:00Z" by="Ana">\nI picked Product UI.\n</stamp>',
    )
    r.apply(reply.messages)
    expect(onScreen(r, 'Button')).toEqual([])
    // The rejected rows are the record: all three are still drawn.
    const rows = r.reachable().filter(c => c.id.startsWith('b0_r') && c.component === 'Text')
    expect(rows.map(c => c['@accessibility']?.label)).toEqual([
      'Marketing site, not picked',
      'Product UI, picked',
      'Start from scratch, not picked',
    ])
  })

  test('a second action on a stamped block is refused, whatever it names (law III)', () => {
    const { bridge, r } = open(KIND)
    const stale = r.press('b0_r0', AT)
    expect(bridge.receive(r.press('b0_r1', AT)).ok).toBe(true)
    const again = bridge.receive(stale)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.refused).toContain('already stamped')
  })

  test('a renderer cannot name a value nobody was offered', () => {
    const { bridge, r } = open(KIND)
    const action = r.press('b0_r0', AT)
    action.action.context.value = 'admin'
    const reply = bridge.receive(action)
    expect(reply.ok).toBe(false)
    expect(bridge.isStamped('project-kind')).toBe(false)
  })

  test('a refused action leaves the block answerable', () => {
    const { bridge, r } = open(KIND)
    const bad = r.press('b0_r0', AT)
    bad.action.context.value = 'nope'
    expect(bridge.receive(bad).ok).toBe(false)
    expect(bridge.receive(r.press('b0_r2', AT)).ok).toBe(true)
  })
})

describe('select=many, @input and @scale submit once', () => {
  const MOOD = `@gallery id=mood select=many max=2
? Pick the ones that feel right
- ed | Editorial | dense, warm | img=https://example.com/ed.jpg
- sw | Swiss     | airy, cold  | img=https://example.com/sw.jpg
- br | Brutal    | loud, black | img=https://example.com/br.jpg`

  test('what the picker holds becomes values= in row order; past max= is refused', () => {
    const { bridge, r } = open(MOOD)
    r.set('/b0/picked', ['ed', 'sw', 'br'])
    expect(bridge.receive(r.press('b0_submit', AT)).ok).toBe(false)
    r.set('/b0/picked', ['br', 'ed'])
    const reply = bridge.receive(r.press('b0_submit', AT))
    expect(reply.ok && reply.stamp.split('\n')[0]).toBe(
      '<stamp block="mood" kind="gallery" values="ed,br" labels="Editorial,Brutal" at="2026-11-12T14:02:00Z">',
    )
    r.apply(reply.messages)
    expect(onScreen(r, 'Button')).toEqual([])
    expect(onScreen(r, 'ChoicePicker')).toEqual([])
  })

  const COMPANY = `@input id=company
? Tell me who you are
_ legal* | text   | Legal name
_ zip    | text   | Postcode | pattern=\\d{5}
_ token  | secret | API key`

  test('the server re-runs every field check: a renderer that skipped its own is refused', () => {
    const { bridge, r } = open(COMPANY)
    r.set('/b0/fields/legal', 'Acme')
    r.set('/b0/fields/zip', '12ab')
    const reply = bridge.receive(r.press('b0_submit', AT))
    expect(reply.ok).toBe(false)
    if (!reply.ok) expect(reply.refused).toContain('zip')
  })

  test('the stamp masks the secret, and so does the frozen surface', () => {
    const { bridge, r } = open(COMPANY)
    r.set('/b0/fields/legal', 'Acme')
    r.set('/b0/fields/token', 'correct horse')
    const reply = bridge.receive(r.press('b0_submit', AT))
    expect(reply.ok).toBe(true)
    if (!reply.ok) return
    expect(reply.stamp).toContain('<field name="token">••••••</field>')
    r.apply(reply.messages)
    const shown = JSON.stringify(r.reachable())
    expect(shown).not.toContain('horse')
    expect(onScreen(r, 'TextField')).toEqual([])
  })

  test('a dial left alone stamps its default; a notch off the track is refused', () => {
    const { bridge, r } = open('@scale id=tone steps=5\n? Set the dials\n% formal | Formal | Playful | 2\n% dense | Dense | Airy | 3')
    r.set('/b0/dials/formal', 9)
    expect(bridge.receive(r.press('b0_submit', AT)).ok).toBe(false)
    r.set('/b0/dials/formal', 4)
    const reply = bridge.receive(r.press('b0_submit', AT))
    expect(reply.ok && reply.stamp).toContain('<dial name="dense" value="3" norm="0.5" poles="Dense|Airy"/>')
  })
})

describe('live rows (§4.1.2)', () => {
  const SLOT = `@choice id=slot query="calendar.free date=2026-11-20"
? When on Friday?
- morning   | Friday morning
- afternoon | Friday afternoon`
  const rows = liveRows([
    { value: '1000', label: '10:00' },
    { value: '1030', label: '10:30' },
  ]).options

  test('the offered rows are the buttons, and the stamp carries them', () => {
    const { bridge, r } = open(SLOT, { offered: { slot: { fn: 'calendar.free', rows } } })
    expect(onScreen(r, 'Button').length).toBe(2)
    const reply = bridge.receive(r.press('b0_r1', AT))
    expect(reply.ok && reply.stamp).toContain('query="calendar.free"')
    expect(reply.ok && reply.stamp).toContain('<offered value="1000" label="10:00"/>')
  })

  test('a written row is refused once the live rows were what the human saw', () => {
    const { bridge, r } = open(SLOT, { offered: { slot: { fn: 'calendar.free', rows } } })
    const action = r.press('b0_r0', AT)
    action.action.context.value = 'morning'
    expect(bridge.receive(action).ok).toBe(false)
  })

  test('an unresolved query offers the written rows and says so', () => {
    const { bridge } = open(SLOT)
    expect(bridge.warnings.join(' ')).toContain('query=calendar.free was not resolved')
  })
})

describe('the envelope is judged before the answer', () => {
  test('another surface, another event, or no timestamp is refused', () => {
    const two = new A2UIBridge(`${KIND}\n@choice id=other\n- a | A`)
    const [first, second] = two.surfaces
    if (!first || !second) throw new Error('two surfaces expected')
    const action = new FakeRenderer(first.message).press('b0_r0', AT)
    action.action.surfaceId = second.surfaceId
    expect(two.receive(action).ok).toBe(false)

    const r = new FakeRenderer(first.message)
    const renamed = r.press('b0_r0', AT)
    renamed.action.name = 'something_else'
    expect(two.receive(renamed).ok).toBe(false)
    expect(two.receive({ version: '1.0', action: { ...r.press('b0_r0', AT).action, timestamp: 'yesterday' } }).ok).toBe(false)
    expect(two.receive('<stamp block="project-kind"/>').ok).toBe(false)
  })

  test('a stamp the server already held survives a restart', () => {
    const { bridge, r } = open(KIND)
    bridge.restore(['project-kind'])
    expect(bridge.receive(r.press('b0_r0', AT)).ok).toBe(false)
  })
})

describe('what the export says about itself', () => {
  test('a block the basic catalog cannot draw is drawn as words, and warned about', () => {
    const out = toA2UI('@card id=c ask="Which next?"\n- [ ] ANV-1 | Metrics')
    expect(out.warnings.join(' ')).toContain('cannot be answered through A2UI')
  })

  test('agent text cannot format itself: markdown in a prompt is escaped', () => {
    const out = toA2UI('@choice id=q\n? *really* # the [one](x)\n- a | A')
    const create = out.surfaces[0]?.message
    const prompt = create && 'createSurface' in create ? create.createSurface.components.find(c => c.id === 'b0_prompt') : undefined
    expect(prompt?.text).toBe('**\\*really\\* \\# the \\[one\\](x)**')
  })

  test('alt= and a danger note reach @accessibility; nothing is sent that was not authored', () => {
    const out = toA2UI('@note id=n tone=danger\nProduction is down.\n@choice id=c alt="Pick a plan"\n- a | A')
    const card = (i: number) => {
      const m = out.surfaces[i]?.message
      return m && 'createSurface' in m ? m.createSurface.components.find(c => c.id === 'root') : undefined
    }
    expect(card(0)?.['@accessibility']).toEqual({ live: 'assertive' })
    expect(card(1)?.['@accessibility']).toEqual({ label: 'Pick a plan' })
  })
})

describe('field checks become A2UI @checks only where A2UI cannot refuse them', () => {
  test('patterns A2UI would reject are kept back, and still enforced by the bridge', () => {
    for (const p of ['\\d{10}', '[A-Z]{2}\\d+', 'ab?c*']) expect(a2uiSafe(p), p).toBe(true)
    for (const p of ['(a+)+', '(a|ab)*c', '\\d+\\s*\\d+', '((a+)b){2}', 'a'.repeat(251)]) expect(a2uiSafe(p), p).toBe(false)
  })

  test('a pattern is anchored, because ANVIL matches the whole value and A2UI searches', () => {
    const [field] = toA2UI('@input id=i\n_ zip* | text | Zip | pattern=\\d{5} | error="Five digits"').surfaces[0]?.slots[0]?.block.fields ?? []
    if (!field) throw new Error('no field')
    expect(fieldChecks(field, '/b0/fields/zip')).toEqual([
      { condition: { '@call': 'required', args: { value: { '@path': '/b0/fields/zip' } } }, message: 'Five digits' },
      { condition: { '@call': 'regex', args: { value: { '@path': '/b0/fields/zip' }, pattern: '^(?:\\d{5})$' } }, message: 'Five digits' },
    ])
  })
})
