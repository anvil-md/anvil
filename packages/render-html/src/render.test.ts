import { describe, expect, test } from 'bun:test'
import { renderAnvilFence } from './render'

const CHOICE = `@choice id=deploy-target
? Where should I ship this?
: Staging is wiped nightly.
- prod   | Production  | live traffic, no undo
- !wipe  | Start over  | we bin the existing brand
- hold   | Nowhere yet`

const CARD = `@card id=ANV-114 type=story status=flight as=14:02
? Payment retry ladder
: Three attempts, then dead-letter.
+ 5 pts | high | Sprint 24
- [x] ANV-115 | Retry scheduler | Ana
- [~] ANV-117 | Dead-letter queue | Kit
> Needs the SQS policy from infra.
- [!] ANV-118 | Alerting hook | blocked on ANV-117
- [ ] ANV-119 | Metrics`

const BOARD = `@board id=sprint-24 max=2
? Sprint 24
- [ ] ANV-119 | Metrics
- [ ] ANV-120 | Runbook entry
- [ ] ANV-121 | Load test
- [~] ANV-117 | Dead-letter queue
- [x] ANV-115 | Retry scheduler`

const GRID = `@grid cols=3 min=16rem gap=tight
@card id=a
? A
- [x] one
@stack
@note
> nested
@end
@end`

const MESSAGE = `@message channel=email to="j@duplo.org" cc="ana@x.dev, kit@x.dev" from="bot@frst.dev" ask="Send it?"
? Re: the retry ladder
> Hey Jonas,
>
> The retry ladder is in. Three attempts, then dead-letter.
+ patch.diff | 4 KB`

const FIXTURES = [
  CHOICE,
  MESSAGE,
  '@message channel=whatsapp to="+66900" sent=14:07\n> shipped',
  '@message channel=nope danger phrase=SEND\n? x\n> y',
  '@gallery id=m render=image\n- a | A | img=https://x.test/a.jpg',
  '@input id=c\n_ a* | longtext | Notes',
  '@scale id=t steps=7\n% a | Lo | Hi | 2',
  '@note tone=warn\n> careful',
  '@choice id=x\n- a | A | b=|c\\| | img=',
  CARD,
  BOARD,
  GRID,
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
  })

  test('no glyph the RENDERER supplies is a text character', () => {
    // The old version of this asserted the whole HTML was ASCII, which only
    // tested that the FIXTURE had no accents -- esc() passes non-ASCII straight
    // through, so it said nothing about the renderer. What matters is the
    // chrome: strip everything the source contributed, and check what is left.
    const src = '@card id=c type=story\n? T\n- [x] a\n- [~] b\n- [!] c\n- [ ] d\n+ chip'
    const chrome = renderAnvilFence(src, true)
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/&middot;|&amp;|&lt;|&gt;|&quot;|&#39;/g, '')
    for (const fromSource of ['c', 'story', 'T', 'a', 'b', 'chip']) void fromSource
    const nonAscii = chrome.match(/[^\x20-\x7E\n]/g) ?? []
    // `·` is the one separator the renderer types, and it lives in a text node
    // inside a font stack we control. Anything else would be a state glyph that
    // had escaped the icon registry.
    expect([...new Set(nonAscii)]).toEqual(['·'])
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

describe('@card', () => {
  test('the bar is counted from the rows, and no attribute can move it', () => {
    const lying = renderAnvilFence('@card id=c progress=100 done=9 total=9\n- [x] a\n- [ ] b\n- [ ] c', true)
    expect(lying).toContain('aria-valuetext="1 of 3 done"')
    expect(lying).toContain('1/3 · 33%')
    expect(lying).not.toContain('9/9')
  })

  test('an epic sums the n/m its children carry', () => {
    const html = renderAnvilFence('@card id=e type=epic\n- [~] A | a | 3/7\n- [x] B | b | 6/6\n- [ ] C | c | 0/9', true)
    expect(html).toContain('9/22')
    expect(html).toContain('anvil-bar-mini')
  })

  test('status is derived when it is not authored', () => {
    expect(renderAnvilFence('@card id=c\n- [ ] a', true)).toContain('data-state="todo"')
    expect(renderAnvilFence('@card id=c\n- [x] a\n- [ ] b', true)).toContain('data-state="flight"')
    expect(renderAnvilFence('@card id=c\n- [x] a', true)).toContain('data-state="done"')
  })

  test('the footer says snapshot, and the renderer never invents a clock', () => {
    expect(renderAnvilFence(CARD, true)).toContain('snapshot · as of 14:02')
    // No `as=`: the time is simply absent. A renderer that stamped Date.now()
    // here would be claiming the data is fresh, which it cannot know.
    const undated = renderAnvilFence('@card id=c\n- [x] a', true)
    expect(undated).toContain('>snapshot<')
    expect(undated).not.toContain('as of')
  })

  test('subtask detail is in the DOM and reachable without a mouse', () => {
    const html = renderAnvilFence(CARD, true)
    const id = html.match(/class="anvil-task-detail" id="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    // Focusable row + an explicit description: hover is an enhancement here,
    // never the only way in. Drag-only ranking is banned in §9 for the same reason.
    expect(html).toContain(`aria-describedby="${id}"`)
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('Needs the SQS policy from infra.')
  })

  test('a card is a record until ask= makes it a question, and only todo rows are pickable', () => {
    const plain = renderAnvilFence(CARD, true)
    expect(plain).not.toContain('anvil-task-pick')

    const asking = renderAnvilFence(`${CARD.replace('@card id=ANV-114', '@card id=ANV-114 ask="What next?"')}`, true)
    expect(asking).toContain('What next?')
    // One todo row in the fixture, so exactly one pickable row -- the done,
    // in-flight and blocked rows are not offers.
    expect(asking.match(/anvil-task-pick"/g) ?? []).toHaveLength(1)
  })

  test('a card only gets a submit when it asks for a set', () => {
    expect(renderAnvilFence(CARD, true)).not.toContain('anvil-submit')
    expect(renderAnvilFence('@card id=c ask="Which?"\n- [ ] a', true)).not.toContain('anvil-submit')
    expect(renderAnvilFence('@card id=c ask="Which?" select=many\n- [ ] a', true)).toContain('anvil-submit')
  })
})

describe('@board', () => {
  test('lanes are derived from the rows, so they cannot disagree with them', () => {
    const html = renderAnvilFence(BOARD, true)
    expect(html).toContain('data-state="todo"')
    expect(html).toContain('data-state="flight"')
    expect(html).toContain('data-state="done"')
    // Nothing is blocked in the fixture, so there is no blocked lane at all.
    expect(html).not.toContain('<section class="anvil-lane" data-state="blocked"')
    // The header counts what is DONE across the board: one of five.
    expect(html).toContain('1/5 · 20% done')
    expect(html).toContain('<span class="anvil-lane-count">3</span>')
  })

  test('a lane bar is announced as a share of the board, not as progress', () => {
    const html = renderAnvilFence(BOARD, true)
    // Three todo cards are not "3 of 5 done". Colour alone must not carry it.
    expect(html).toContain('aria-valuetext="3 of 5 cards todo"')
    expect(html).not.toContain('3 of 5 done')
  })

  test('a board claims no single state of its own -- that is what lanes are for', () => {
    const html = renderAnvilFence(BOARD, true)
    expect(html.slice(0, html.indexOf('</header>'))).not.toContain('anvil-status')
  })

  test('truncation is never silent', () => {
    // max=2 with three todos: the board says so rather than looking complete.
    expect(renderAnvilFence(BOARD, true)).toContain('+1 more')
  })

  test('a board is a record and never submits', () => {
    expect(renderAnvilFence(BOARD, true)).not.toContain('anvil-submit')
  })
})

describe('@message', () => {
  test('a message is a DRAFT until something asserts otherwise', () => {
    // The safety property of the whole block. A draft that renders like a sent
    // message is how a human concludes an email went out when it never did.
    const draft = renderAnvilFence(MESSAGE, true)
    expect(draft).toContain('data-state="draft"')
    expect(draft).toContain('data-locked="no"')
    expect(draft).toContain('draft &middot; not sent')

    const sent = renderAnvilFence('@message channel=whatsapp to="+66900" sent=14:07\n> done', true)
    expect(sent).toContain('data-state="sent"')
    expect(sent).toContain('sent · at 14:07')
    expect(sent).not.toContain('not sent')
  })

  test('every spelling of no is not sent', () => {
    // `sent=No` -- the casing a model is most likely to produce -- rendered as
    // SENT when this was two exact-string comparisons.
    for (const v of ['false', 'No', 'NO', 'FALSE', '0', 'off', 'n', 'Never']) {
      const html = renderAnvilFence(`@message to=x sent=${v}\n> hi`, true)
      expect(html).toContain('data-state="draft"')
      expect(html).toContain('not sent')
    }
  })

  test('the click is approval, not delivery', () => {
    // A block that flipped straight to `sent` on the stamp would be claiming a
    // delivery nobody witnessed -- the §4.15.1 lie, three seconds further on.
    const approved = renderAnvilFence('@message to=a@x state=approved at=14:04 ask="Send?"\n> hi', true)
    expect(approved).toContain('data-state="approved"')
    expect(approved).toContain('approved &middot; sending')
    expect(approved).not.toContain('>sent<')
    // Locked: the question stays, the button does not.
    expect(approved).toContain('data-locked="yes"')
    expect(approved).toContain('Send?')
    expect(approved).not.toContain('anvil-submit')
  })

  test('every state past draft renders differently and locks', () => {
    for (const [state, pill] of [
      ['approved', 'approved &middot; sending'],
      ['sent', '>sent<'],
      ['failed', '>not sent<'],
      ['declined', '>declined<'],
    ] as const) {
      const html = renderAnvilFence(`@message to=a@x state=${state} ask="Send?"\n> hi`, true)
      expect(html, state).toContain(`data-state="${state}"`)
      expect(html, state).toContain(pill)
      expect(html, state).toContain('data-locked="yes"')
      expect(html, state).not.toContain('anvil-submit')
    }
  })

  test('the gate becomes a receipt rather than vanishing', () => {
    // §9.2: a stamped block keeps the height it had while open, and the gate is
    // the tallest thing on a message.
    const draft = renderAnvilFence('@message to=a@x ask="Send it?"\n> hi', true)
    const sent = renderAnvilFence('@message to=a@x ask="Send it?" state=sent at=14:07 by=Ana\n> hi', true)
    for (const html of [draft, sent]) expect(html).toContain('anvil-msg-gate')
    expect(sent).toContain('anvil-msg-receipt')
    // The question it was asked is part of the record (§4.1, same rule).
    expect(sent).toContain('Send it?')
    expect(sent).toContain('by Ana · at 14:07')
  })

  test('a failure says why, and error= alone is enough to mean failed', () => {
    const html = renderAnvilFence('@message to=a@x ask="Send?" error="550 mailbox unavailable"\n> hi', true)
    expect(html).toContain('data-state="failed"')
    expect(html).toContain('550 mailbox unavailable')
  })

  test('state= wins over the sent= sugar', () => {
    const html = renderAnvilFence('@message to=a@x sent=14:07 state=failed\n> hi', true)
    expect(html).toContain('data-state="failed"')
  })

  test('addresses are text, never links', () => {
    const html = renderAnvilFence(MESSAGE, true)
    expect(html).toContain('j@duplo.org')
    // A mailto in a draft is one mis-click from a composer full of agent text.
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('<a ')
  })

  test('cc splits on commas and semicolons alike', () => {
    const html = renderAnvilFence('@message to="a@x" cc="b@x, c@x; d@x"\n> hi', true)
    for (const who of ['b@x', 'c@x', 'd@x']) expect(html).toContain(`>${who}<`)
  })

  test('one + line is one attachment, not one chip per cell', () => {
    const html = renderAnvilFence(MESSAGE, true)
    expect(html.match(/<li>/g) ?? []).toHaveLength(1)
    expect(html).toContain('patch.diff')
    expect(html).toContain('4 KB')
  })

  test('the button says what the click does', () => {
    expect(renderAnvilFence(MESSAGE, true)).toContain('>Send<')
    expect(renderAnvilFence('@message to=x submit="Fire away"\n? S\n> b', true)).not.toContain('anvil-submit')
  })

  test('subject= fills the title, and ? wins when both are given', () => {
    expect(renderAnvilFence('@message to=x subject="Hello World"\n> hi', true)).toContain('Hello World')
    const both = renderAnvilFence('@message to=x subject="From attr"\n? From the line\n> hi', true)
    expect(both).toContain('From the line')
    expect(both).not.toContain('From attr')
  })

  test('an unknown channel is a plain memo plus a warning, never borrowed chrome', () => {
    const html = renderAnvilFence('@message channel=carrierpigeon to=x\n> hi', true)
    expect(html).toContain('anvil-msg-envelope')
    expect(html).toContain('unknown channel')
    expect(html).not.toContain('anvil-msg-bubble')
  })

  test('a bubble channel shows the recipient, since it has no envelope table', () => {
    const html = renderAnvilFence('@message channel=imessage to="+66900"\n> hi', true)
    expect(html).toContain('anvil-msg-bubble')
    expect(html).toContain('+66900')
    expect(html).not.toContain('anvil-envelope')
  })

  test('blank lines in the body are paragraph breaks', () => {
    const html = renderAnvilFence('@message to=x\n> one\n>\n> two', true)
    expect(html.match(/<p>/g) ?? []).toHaveLength(2)
  })
})

describe('layout', () => {
  test('a grid emits its track variables', () => {
    const html = renderAnvilFence(GRID, true)
    expect(html).toContain('--anvil-cols:3')
    expect(html).toContain('--anvil-min:16rem')
    expect(html).toContain('--anvil-lgap:0.35rem')
  })

  test('no breakpoint governs the collapse', async () => {
    // This used to assert the HTML string contained no `@media`, which it never
    // could. The claim is about the STYLESHEET, so read the stylesheet: the
    // auto-fit rule must not live inside a media query.
    const css = await Bun.file(new URL('../anvil.css', import.meta.url)).text()
    const blocks = css.split(/@media[^{]*\{/).slice(1)
    for (const b of blocks) expect(b.slice(0, b.indexOf('\n}\n'))).not.toContain('.anvil-auto')
    expect(css).toContain('repeat(\n    auto-fit,')
  })

  test('cols is clamped and gap is a keyword, never a raw length', () => {
    const html = renderAnvilFence('@grid cols=99 gap=8rem\n@note\n> x', true)
    expect(html).toContain('--anvil-cols:6')
    expect(html).toContain('--anvil-lgap:0.6rem')
  })

  test('an inherited property is not a gap keyword', () => {
    // `gap=constructor` substituted a function's source text into the custom
    // property, which invalidated the track formula and collapsed the grid.
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const html = renderAnvilFence(`@grid gap=${bad}\n@note\n> x`, true)
      expect(html).toContain('--anvil-lgap:0.6rem')
      expect(html).not.toContain('native code')
    }
  })

  test('min= is dropped whole unless it is a plain length', () => {
    for (const bad of ['100vw', '9999999px', 'calc(100%-1px)', '16rem;background:red', 'auto']) {
      const html = renderAnvilFence(`@grid min=${bad}\n@note\n> x`, true)
      expect(html).not.toContain('--anvil-min')
    }
    expect(renderAnvilFence('@grid min=18rem\n@note\n> x', true)).toContain('--anvil-min:18rem')
  })

  test('min= is allowlisted rather than escaped into the style attribute', () => {
    const html = renderAnvilFence('@grid min=16rem;background:url(javascript:alert(1))\n@note\n> x', true)
    expect(html).not.toContain('background')
    expect(html).not.toContain('--anvil-min:16rem;background')
  })

  test('layout carries no identity and no affordance', () => {
    const html = renderAnvilFence(GRID, true)
    const layout = html.slice(html.indexOf('<div class="anvil-layout'), html.indexOf('<section'))
    expect(layout).not.toContain('data-anvil-id')
    expect(layout).not.toContain('<button')
  })

  test('children render inside the container, in order', () => {
    const html = renderAnvilFence(GRID, true)
    expect(html.indexOf('anvil-layout')).toBeLessThan(html.indexOf('data-anvil-id="a"'))
    expect(html.indexOf('data-anvil-id="a"')).toBeLessThan(html.indexOf('nested'))
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

describe('regressions', () => {
  test('a knob never leaves its track, whatever steps= says', () => {
    // steps=1: the parser defaulted to 5 and clamped the value to 4; the
    // renderer clamped to 2 and put the knob at left:300%.
    for (const steps of ['1', '0', '-3', '99', 'nonsense']) {
      const html = renderAnvilFence(`@scale id=s steps=${steps}\n% a | Lo | Hi | 4`, true)
      for (const m of html.matchAll(/left:([\d.]+)%/g)) {
        expect(Number(m[1])).toBeGreaterThanOrEqual(0)
        expect(Number(m[1])).toBeLessThanOrEqual(100)
      }
    }
  })

  test('an authored status loses to the rows and says so', () => {
    const html = renderAnvilFence('@card id=c status=done\n- [ ] a\n- [ ] b', true)
    expect(html).toContain('data-state="todo"')
    expect(html).toContain('contradicts 0/2')
    // blocked is never a contradiction: the rows cannot know it.
    const blocked = renderAnvilFence('@card id=c status=blocked\n- [ ] a', true)
    expect(blocked).toContain('data-state="blocked"')
    expect(blocked).not.toContain('contradicts')
  })

  test('card prose is drawn, not parsed and dropped', () => {
    const html = renderAnvilFence('@card id=c\n> Blocked on legal review.\n- [ ] a', true)
    expect(html).toContain('Blocked on legal review.')
  })

  test('href makes the ref a link, and only when it is a real one', () => {
    expect(renderAnvilFence('@card id=ANV-1 href=https://x.test/1\n- [ ] a', true)).toContain(
      '<a class="anvil-ref anvil-ref-link" href="https://x.test/1"',
    )
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '/relative']) {
      const html = renderAnvilFence(`@card id=ANV-1 href=${bad}\n- [ ] a`, true)
      expect(html).not.toContain('<a ')
    }
  })

  test('a + row outside a block that draws it is a warning, not a silent drop', () => {
    expect(renderAnvilFence('@choice id=c\n+ chip\n- a | A', true)).toContain('only drawn on')
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
