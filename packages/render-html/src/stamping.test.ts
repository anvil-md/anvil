/**
 * The answer half: what each block state draws, and what the hydrator turns a
 * human's clicks into. Asserted on the DOM the HTML parses into -- attributes and
 * structure a host and a screen reader depend on, never wording or class names
 * beyond the hooks the hydrator itself reads.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { type AnvilAnswer, parseAnvil, STAMP_MASK, stampAnswer } from '@anvil-md/parser'
import { answerOf, type AnvilStamping, type BlockState } from './ask'
import { attachAnvil } from './hydrate'
import { renderAnvilFence } from './render'

beforeAll(() => GlobalRegistrator.register())
afterAll(() => GlobalRegistrator.unregister())

const ONE = '@choice id=db select=one\n? Which database?\n- sqlite | SQLite\n- pg | Postgres\n- redis | Redis'
const MANY = '@choice id=tags select=many\n? Tags?\n- a | Alpha\n- b | Beta\n- c | Gamma'
const INPUT = '@input id=acct\n? Account\n_ name* | text | Name\n_ token | secret | Token\n_ agree | bool | I agree'
const SCALE = '@scale id=tone steps=5\n? Tone\n% formal | Formal | Playful | 3'

function stamping(state: BlockState | undefined, extra: Partial<AnvilStamping> = {}): AnvilStamping {
  return { resolve: () => state, canStamp: true, ...extra }
}

function draw(src: string, s?: AnvilStamping, closed = true): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderAnvilFence(src, closed, s ? { stamping: s } : undefined)
  document.body.replaceChildren(root)
  return root
}

function stampOf(src: string, answer: AnvilAnswer, opts = {}) {
  const block = parseAnvil(src).blocks[0]
  if (!block) throw new Error('no block')
  const r = stampAnswer(block, answer, opts)
  if (!r.ok) throw new Error(r.refused)
  return r.stamp
}

const section = (root: HTMLElement) => root.querySelector<HTMLElement>('.anvil-block') as HTMLElement
const rowEls = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLButtonElement>('[data-anvil-value]'))
const foot = (root: HTMLElement) => root.querySelector('.anvil-foot')?.textContent?.trim()

describe('what each state draws', () => {
  test('no stamping: display only, every row disabled, no state', () => {
    const root = draw(ONE)
    expect(rowEls(root).every(r => r.disabled)).toBe(true)
    expect(section(root).dataset.stampState).toBeUndefined()
  })

  test('state not known yet: inert, never clickable-then-stamped (7.6)', () => {
    const root = draw(ONE, stamping(undefined))
    expect(rowEls(root).every(r => r.disabled)).toBe(true)
    expect(section(root).hasAttribute('data-anvil-interactive')).toBe(false)
  })

  test('open for a viewer who can stamp: live rows, marked interactive', () => {
    const root = draw(ONE, stamping({ state: 'open' }))
    expect(rowEls(root).some(r => r.disabled)).toBe(false)
    expect(section(root).dataset.stampState).toBe('open')
    expect(section(root).dataset.select).toBe('one')
    expect(section(root).hasAttribute('data-anvil-interactive')).toBe(true)
  })

  test('open for a viewer who cannot stamp: disabled, and the host says who it waits on (8.2.1)', () => {
    const root = draw(ONE, stamping({ state: 'open' }, { canStamp: false, waitingOn: 'waiting on an org admin' }))
    expect(rowEls(root).every(r => r.disabled)).toBe(true)
    expect(foot(root)).toBe('waiting on an org admin')
  })

  test('a fence still streaming is never answerable, whatever the server says (5)', () => {
    const root = draw(ONE, stamping({ state: 'open' }), false)
    expect(section(root).hasAttribute('data-anvil-interactive')).toBe(false)
    expect(rowEls(root).every(r => r.disabled)).toBe(true)
  })

  test('pending: everything disabled, the chosen row marked, nothing claims stamped (7.2)', () => {
    const root = draw(ONE, stamping({ state: 'pending', answer: { kind: 'pick', values: ['pg'] } }))
    expect(section(root).dataset.stampState).toBe('pending')
    expect(rowEls(root).every(r => r.disabled)).toBe(true)
    expect(rowEls(root).filter(r => r.dataset.picked === 'yes').map(r => r.dataset.anvilValue)).toEqual(['pg'])
  })

  test('stamped: the pick, the rejected rows, who and when -- never collapsed (law IV)', () => {
    const stamp = stampOf(ONE, { kind: 'pick', values: ['redis'] }, { by: 'Ana', at: '2026-11-23T14:04:51.000Z' })
    const root = draw(ONE, stamping({ state: 'stamped', stamp }))
    expect(rowEls(root).map(r => r.dataset.anvilValue)).toEqual(['sqlite', 'pg', 'redis'])
    expect(rowEls(root).filter(r => r.dataset.picked === 'yes').map(r => r.dataset.anvilValue)).toEqual(['redis'])
    expect(rowEls(root).every(r => r.disabled)).toBe(true)
    expect(foot(root)).toBe('answered · by Ana · 2026-11-23 14:04 UTC')
  })

  test('stamped input shows the answered values, the secret masked (7.6)', () => {
    const stamp = stampOf(INPUT, { kind: 'input', fields: { name: 'Acme', token: 'sk-live-123', agree: 'true' } })
    const root = draw(INPUT, stamping({ state: 'stamped', stamp }))
    const value = (n: string) => root.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value
    expect(value('name')).toBe('Acme')
    expect(value('token')).toBe(STAMP_MASK)
    expect(root.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    expect(root.innerHTML.includes('sk-live-123')).toBe(false)
  })

  test('stamped scale puts the knob on the answered notch', () => {
    const stamp = stampOf(SCALE, { kind: 'scale', values: { formal: 5 } })
    const root = draw(SCALE, stamping({ state: 'stamped', stamp }))
    expect(root.querySelector<HTMLElement>('.anvil-knob')?.style.left).toBe('100.0%')
  })

  test('a refusal comes back as an alert on an open block (7.2)', () => {
    const root = draw(ONE, stamping({ state: 'open', error: 'already answered elsewhere' }))
    expect(root.querySelector('[role="alert"]')?.textContent).toBe('already answered elsewhere')
    expect(section(root).hasAttribute('data-anvil-interactive')).toBe(true)
  })
})

describe('answerOf reads a stamp back into the answer that made it', () => {
  test.each<[string, string, AnvilAnswer]>([
    ['select=one', ONE, { kind: 'pick', values: ['pg'] }],
    ['select=many', MANY, { kind: 'pick', values: ['a', 'c'] }],
    ['input', INPUT, { kind: 'input', fields: { name: 'Acme', agree: 'false' } }],
    ['scale', SCALE, { kind: 'scale', values: { formal: 2 } }],
  ])('%s', (_name, src, answer) => {
    expect(answerOf(stampOf(src, answer))).toEqual(answer)
  })
})

describe('the hydrator', () => {
  function hydrate(src: string, state: BlockState = { state: 'open' }) {
    const root = draw(src, stamping(state))
    const got: [string, AnvilAnswer][] = []
    const detach = attachAnvil(root, { onAnswer: (id, a) => got.push([id, a]) })
    return { root, got, detach }
  }
  const click = (el: Element | null | undefined) => (el as HTMLElement).click()
  const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

  test('select=one: the click IS the answer, once', () => {
    const { root, got } = hydrate(ONE)
    click(rowEls(root)[1])
    expect(got).toEqual([['db', { kind: 'pick', values: ['pg'] }]])
  })

  test('select=many: rows toggle, submit answers in row order', () => {
    const { root, got } = hydrate(MANY)
    const [a, b, c] = rowEls(root)
    click(c)
    click(a)
    click(b)
    click(b)
    expect(got).toEqual([])
    click(root.querySelector('[data-anvil-submit]'))
    expect(got).toEqual([['tags', { kind: 'pick', values: ['a', 'c'] }]])
  })

  test('input: values and the switch, and a missing required field answers nothing', () => {
    const { root, got } = hydrate(INPUT)
    click(root.querySelector('[data-anvil-submit]'))
    expect(got).toEqual([])
    const set = (n: string, v: string) => {
      const el = root.querySelector<HTMLInputElement>(`[name="${n}"]`) as HTMLInputElement
      el.value = v
    }
    set('name', 'Acme')
    set('token', 's3cret')
    click(root.querySelector('[role="switch"]'))
    click(root.querySelector('[data-anvil-submit]'))
    expect(got).toEqual([['acct', { kind: 'input', fields: { name: 'Acme', token: 's3cret', agree: 'true' } }]])
  })

  test('scale: the knob follows the range, submit answers the notch', () => {
    const { root, got } = hydrate(SCALE)
    const range = root.querySelector<HTMLInputElement>('input.anvil-range') as HTMLInputElement
    range.value = '1'
    range.dispatchEvent(new Event('input', { bubbles: true }))
    expect(root.querySelector<HTMLElement>('.anvil-knob')?.style.left).toBe('0.0%')
    click(root.querySelector('[data-anvil-submit]'))
    expect(got).toEqual([['tone', { kind: 'scale', values: { formal: 1 } }]])
  })

  test('number keys pick the nth row (9.6)', () => {
    const { root, got } = hydrate(ONE)
    press(rowEls(root)[0] as HTMLElement, '3')
    expect(got).toEqual([['db', { kind: 'pick', values: ['redis'] }]])
  })

  test('a stamped block answers nothing, however it is clicked', () => {
    const stamp = stampOf(ONE, { kind: 'pick', values: ['pg'] })
    const { root, got } = hydrate(ONE, { state: 'stamped', stamp })
    for (const r of rowEls(root)) r.removeAttribute('disabled')
    click(rowEls(root)[0])
    expect(got).toEqual([])
  })

  test('delegation survives the host re-rendering the markup', () => {
    const { root, got } = hydrate(ONE)
    root.innerHTML = renderAnvilFence(ONE, true, { stamping: stamping({ state: 'open' }) })
    click(rowEls(root)[0])
    expect(got).toEqual([['db', { kind: 'pick', values: ['sqlite'] }]])
  })

  test('detach stops listening', () => {
    const { root, got, detach } = hydrate(ONE)
    detach()
    click(rowEls(root)[0])
    expect(got).toEqual([])
  })
})
