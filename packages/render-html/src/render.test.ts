import { describe, expect, test } from 'bun:test'
import { renderAnvilFence } from './render'

const CHOICE = `@choice id=deploy-target
? Where should I ship this?
: Staging is wiped nightly.
- prod   | Production  | live traffic, no undo
- !wipe  | Start over  | we bin the existing brand
- hold   | Nowhere yet`

const FIXTURES = [
  CHOICE,
  '@gallery id=m render=image\n- a | A | img=https://x.test/a.jpg',
  '@input id=c\n_ a* | longtext | Notes',
  '@scale id=t steps=7\n% a | Lo | Hi | 2',
  '@note tone=warn\n> careful',
  '@choice id=x\n- a | A | b=|c\\| | img=',
]

describe('renderAnvilFence', () => {
  test('emits a block per parsed block and marks streaming', () => {
    expect(renderAnvilFence(CHOICE, true)).toContain('data-anvil-id="deploy-target"')
    expect(renderAnvilFence(CHOICE, false)).toContain('anvil-doc-streaming')
  })

  test('every control is inert -- this package draws, it does not run', () => {
    const html = renderAnvilFence(CHOICE, true)
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b).toContain('disabled')
  })

  test('secret renders masked, not as a plain text input', () => {
    expect(renderAnvilFence('@input id=i\n_ token | secret | Token', true)).toContain('type="password"')
  })

  test('every field type gets its own control', () => {
    const src =
      '@input id=i\n_ a | text | A\n_ b | number | B\n_ c | secret | C\n_ d | url | D\n_ e | date | E\n_ f | longtext | F\n_ g | bool | G'
    const html = renderAnvilFence(src, true)
    for (const t of ['text', 'number', 'password', 'url', 'date']) {
      expect(html).toContain(`type="${t}"`)
    }
    expect(html).toContain('<textarea')
    expect(html).toContain('anvil-switch')
  })

  test('single-select never gets a submit button; multi always does', () => {
    expect(renderAnvilFence('@choice id=x\n? Q\n- a | A', true)).not.toContain('anvil-submit')
    expect(renderAnvilFence('@gallery id=g\n? Q\n- a | A', true)).not.toContain('anvil-submit')
    expect(renderAnvilFence('@choice id=x select=many\n? Q\n- a | A', true)).toContain('anvil-submit')
    expect(renderAnvilFence('@gallery id=g select=many\n? Q\n- a | A', true)).toContain('anvil-submit')
    // input and scale always submit: there is no click that could stand in.
    expect(renderAnvilFence('@input id=i\n_ a | text | A', true)).toContain('anvil-submit')
    expect(renderAnvilFence('@scale id=s\n% a | Lo | Hi', true)).toContain('anvil-submit')
  })

  test('a note keeps its warnings inside the tinted box', () => {
    const html = renderAnvilFence('@wormhole id=x\n? hi', true)
    const noteEnd = html.lastIndexOf('</div></div>')
    const warnAt = html.indexOf('anvil-warn')
    expect(warnAt).toBeGreaterThan(-1)
    expect(warnAt).toBeLessThan(noteEnd)
  })

  test('warnings render above the action, not orphaned below it', () => {
    const html = renderAnvilFence('@input id=i\n_ x | nonsense | X', true)
    expect(html.indexOf('anvil-warn')).toBeLessThan(html.indexOf('anvil-submit'))
  })

  test('icons are inline SVG, never a text glyph that could tofu', () => {
    const html = renderAnvilFence(CHOICE, true)
    expect(html).toContain('<svg class="anvil-svg"')
    expect(html).toContain('stroke="currentColor"')
    // No non-ASCII may reach the emitted markup: that is what tofu'd before.
    expect(/[^\x20-\x7E\n]/.test(html.replace(/[·]/g, ''))).toBe(false)
  })

  test('a gallery icon follows its render mode', () => {
    const swatch = renderAnvilFence('@gallery id=g render=swatch\n? P\n- a | A', true)
    const type = renderAnvilFence('@gallery id=g render=type\n? P\n- a | A', true)
    expect(swatch).toContain('M12 22a1 1 0 0 1 0-20')
    expect(type).toContain('M12 4v16')
    expect(swatch).not.toContain('M12 4v16')
  })

  test('note tone picks its own icon and an unknown icon= falls back', () => {
    expect(renderAnvilFence('@note tone=danger\n> boom', true)).toContain('M15.312 2a2 2')
    const bogus = renderAnvilFence('@note tone=warn icon=nonsense\n> hm', true)
    expect(bogus).toContain('<svg')
    expect(bogus).toContain('m21.73 18-8-14')
  })

  test('icon= overrides the kind default', () => {
    expect(renderAnvilFence('@choice id=x icon=palette\n? P\n- a | A', true)).toContain('M12 22a1 1 0 0 1 0-20')
  })
})

describe('injection', () => {
  test('a non-hex swatch is dropped, not escaped into the style attr', () => {
    const html = renderAnvilFence('@gallery id=g render=swatch\n- a | swatch=#fff;}</style><x>', true)
    expect(html).not.toContain('</style>')
    expect(html).not.toContain('<x>')
  })

  test('a non-http img url never reaches src', () => {
    const html = renderAnvilFence('@gallery id=g\n- a | img=javascript:alert(1)', true)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('anvil-img-missing')
  })

  test('a font family with quotes is refused rather than injected', () => {
    expect(renderAnvilFence("@gallery id=g render=type\n- a | font=x',y:url(z)", true)).not.toContain('url(z)')
  })

  test('prompt text is escaped', () => {
    const html = renderAnvilFence('@choice id=x\n? <img src=x onerror=alert(1)>\n- a | A', true)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  test('labels, hints and placeholders are escaped', () => {
    const html = renderAnvilFence('@input id=i\n_ a | text | <b>L</b> | <i>P</i>', true)
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<i>P')
  })
})

describe('totality contract', () => {
  test('no prefix of any fixture can make the renderer throw', () => {
    for (const fixture of FIXTURES) {
      for (let i = 0; i <= fixture.length; i++) {
        expect(() => renderAnvilFence(fixture.slice(0, i), false)).not.toThrow()
      }
    }
  })

  test('degenerate input still returns a string', () => {
    for (const src of ['', '@', '@@@@', '|||||', '- ', '?']) {
      expect(typeof renderAnvilFence(src, true)).toBe('string')
    }
  })
})
