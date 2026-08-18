import { describe, expect, test } from 'bun:test'
import { parseAnvil } from './parse'
import { taskProgress } from './types'

const CHOICE = `@choice id=deploy-target
? Where should I ship this?
: Staging is wiped nightly.
- prod   | Production  | live traffic, no undo
- !wipe  | Start over  | we bin the existing brand
- hold   | Nowhere yet`

describe('parseAnvil', () => {
  test('parses a choice: prompt, subtext, options, hints', () => {
    const [b] = parseAnvil(CHOICE).blocks
    expect(b?.kind).toBe('choice')
    expect(b?.id).toBe('deploy-target')
    expect(b?.derivedId).toBe(false)
    expect(b?.prompt).toBe('Where should I ship this?')
    expect(b?.subtext).toBe('Staging is wiped nightly.')
    expect(b?.options.map(o => o.value)).toEqual(['prod', 'wipe', 'hold'])
    expect(b?.options[0]?.hint).toBe('live traffic, no undo')
    expect(b?.options[1]?.danger).toBe(true)
    // A row with no hint cell must not invent one.
    expect(b?.options[2]?.hint).toBeUndefined()
  })

  test('attrs: quoted, bare-as-true, and plain', () => {
    const [b] = parseAnvil('@choice id=x select=many danger submit="Ship it"').blocks
    expect(b?.attrs.select).toBe('many')
    expect(b?.attrs.danger).toBe(true)
    expect(b?.attrs.submit).toBe('Ship it')
  })

  test('escaped pipe survives as a literal', () => {
    const [b] = parseAnvil('@choice id=x\n- a | Either \\| or | pick one').blocks
    expect(b?.options[0]?.label).toBe('Either | or')
    expect(b?.options[0]?.hint).toBe('pick one')
  })

  test('gallery cells are unordered and typed', () => {
    const src = '@gallery id=m render=swatch\n- ink | swatch=#111,#f5f2ea | Ink and paper | warm'
    const [b] = parseAnvil(src).blocks
    expect(b?.options[0]?.swatch).toEqual(['#111', '#f5f2ea'])
    expect(b?.options[0]?.label).toBe('Ink and paper')
    expect(b?.options[0]?.hint).toBe('warm')
  })

  test('fields: required star, type fallback, derived label', () => {
    const src = '@input id=c\n_ legal* | text | Legal name | Acme Ltd\n_ notes | wat\n_ site | url'
    const [b] = parseAnvil(src).blocks
    expect(b?.fields[0]).toMatchObject({ name: 'legal', required: true, placeholder: 'Acme Ltd' })
    expect(b?.fields[1]?.type).toBe('text')
    expect(b?.warnings.join()).toMatch(/unknown field type "wat"/)
    expect(b?.fields[2]?.label).toBe('Site')
  })

  test('dial default is clamped into the step range', () => {
    const src = '@scale id=t steps=5\n% a | Lo | Hi | 99\n% b | Lo | Hi | -4\n% c | Lo | Hi'
    const [b] = parseAnvil(src).blocks
    expect(b?.dials.map(d => d.value)).toEqual([5, 1, 3])
  })

  test('unknown block degrades to a warned note, never a throw', () => {
    const [b] = parseAnvil('@wormhole id=x\n? hi').blocks
    expect(b?.kind).toBe('note')
    expect(b?.attrs.tone).toBe('warn')
    expect(b?.warnings.join()).toMatch(/unknown block "@wormhole"/)
  })

  test('derived ids are content-derived and position-independent', () => {
    const a = parseAnvil('@choice\n- x | X').blocks[0]
    const b = parseAnvil('@note\n> filler\n\n@choice\n- x | X').blocks[1]
    expect(a?.derivedId).toBe(true)
    expect(a?.id).toBe(b?.id)
    // Different content must not collide.
    expect(parseAnvil('@choice\n- y | Y').blocks[0]?.id).not.toBe(a?.id)
  })

  test('comments never reach the output', () => {
    const [b] = parseAnvil('@choice id=x\n# secret note\n- a | A').blocks
    expect(b?.options).toHaveLength(1)
    expect(JSON.stringify(b)).not.toContain('secret note')
  })

  test('a line with no sigil folds into the prompt rather than vanishing', () => {
    const [b] = parseAnvil('@choice id=x\nplain words\n- a | A').blocks
    expect(b?.prompt).toBe('plain words')
  })

  test('over-long option lists warn but are never truncated', () => {
    const rows = Array.from({ length: 14 }, (_, i) => `- v${i} | Label ${i}`).join('\n')
    const [b] = parseAnvil(`@choice id=x\n${rows}`).blocks
    expect(b?.options).toHaveLength(14)
    expect(b?.warnings.join()).toMatch(/past the point a human scans/)
  })

  test('partial marks the doc but still yields blocks', () => {
    const doc = parseAnvil('@choice id=x\n- a | A', { partial: true })
    expect(doc.partial).toBe(true)
    expect(doc.blocks).toHaveLength(1)
  })
})

const CARD = `@card id=ANV-114 type=story status=flight as=14:02
? Payment retry ladder
: Three attempts, then dead-letter.
+ 5 pts | high | Sprint 24
- [x] ANV-115 | Retry scheduler | Ana
- [~] ANV-117 | Dead-letter queue | Kit
> Needs the SQS policy from infra.
> PR 482.
- [!] ANV-118 | Alerting hook | blocked on ANV-117
- [ ] ANV-119 | Metrics`

describe('@card', () => {
  test('reads the four checkbox states, plus the in-flight aliases', () => {
    const [b] = parseAnvil('@card id=c\n- [ ] a\n- [x] b\n- [~] c\n- [!] d\n- [/] e\n- [-] f').blocks
    expect(b?.tasks.map(t => t.state)).toEqual(['todo', 'done', 'flight', 'blocked', 'flight', 'flight'])
    expect(b?.warnings).toEqual([])
  })

  test('a task row is an option row that already has an answer', () => {
    const [b] = parseAnvil(CARD).blocks
    expect(b?.kind).toBe('card')
    expect(b?.prompt).toBe('Payment retry ladder')
    expect(b?.tasks[0]).toMatchObject({ state: 'done', ref: 'ANV-115', label: 'Retry scheduler', meta: 'Ana' })
    // One cell only: the ref doubles as the label, exactly as an option's value does.
    const [solo] = parseAnvil('@card id=c\n- [ ] Write the runbook').blocks
    expect(solo?.tasks[0]).toMatchObject({ ref: 'Write the runbook', label: 'Write the runbook' })
  })

  test('> under a task row is that row detail, not the block prose', () => {
    const [b] = parseAnvil(CARD).blocks
    expect(b?.tasks[1]?.detail).toBe('Needs the SQS policy from infra.\nPR 482.')
    expect(b?.prose).toBe('')
  })

  test('> before any task row is still prose', () => {
    const [b] = parseAnvil('@card id=c\n> orphan\n- [ ] a').blocks
    expect(b?.prose).toBe('orphan')
    expect(b?.tasks[0]?.detail).toBe('')
  })

  test('+ keeps its cells grouped by line', () => {
    const [b] = parseAnvil(CARD).blocks
    // One line in, one row out. A @message needs `patch.diff | 4 KB` to stay a
    // single attachment; flattening here made the size a second one.
    expect(b?.meta).toEqual([['5 pts', 'high', 'Sprint 24']])
    const [two] = parseAnvil('@card id=c\n+ a | b\n+ c').blocks
    expect(two?.meta).toEqual([['a', 'b'], ['c']])
  })

  test('progress is COUNTED, and no attribute can override it', () => {
    // The whole reason @card is an ANVIL block rather than an HTML embed.
    const [b] = parseAnvil('@card id=c progress=99/99 done=99\n- [x] a\n- [ ] b\n- [ ] c').blocks
    const p = taskProgress(b!)
    expect(p).toMatchObject({ done: 1, total: 3, pct: 33, rollup: false })
  })

  test('an n/m meta cell rolls up, and a bare row still counts as one', () => {
    const [b] = parseAnvil('@card id=e\n- [~] A | Story A | 3/7\n- [x] B | Story B | 6/6\n- [ ] C | Story C').blocks
    const p = taskProgress(b!)
    expect(p).toMatchObject({ done: 9, total: 14, rollup: true })
  })

  test('a child claiming more done than total is refused, not clamped', () => {
    // Clamping laundered a typo into a confident 4/4 -- an open row rendering
    // as 100% done, which is the exact lie the block exists to prevent.
    const [b] = parseAnvil('@card id=e\n- [~] A | Story A | 9/4').blocks
    expect(b?.tasks[0]?.total).toBeUndefined()
    expect(b?.warnings.join(' ')).toContain('more done than total')
  })

  test('a date in the meta cell is not a rollup', () => {
    // `due 24/12` scored twelve of twelve and rendered the card done.
    for (const meta of ['due 24/12', 'rev 1/2', 'PR 3/7 checks']) {
      const [b] = parseAnvil(`@card id=c\n- [ ] ANV-1 | Ship it | ${meta}`).blocks
      expect(b?.tasks[0]?.total).toBeUndefined()
      expect(taskProgress(b!)).toMatchObject({ done: 0, total: 1 })
    }
  })

  test('a count after an explicit separator IS a rollup, and keeps the rest of the cell', () => {
    const [b] = parseAnvil('@card id=c\n- [~] A | Story | Kit · 6/6\n- [ ] B | Other | 0/9').blocks
    expect(b?.tasks[0]).toMatchObject({ done: 6, total: 6, meta: 'Kit' })
    expect(taskProgress(b!)).toMatchObject({ done: 6, total: 15, rollup: true })
  })

  test('a checkbox on a @choice warns and still renders the option', () => {
    const [b] = parseAnvil('@choice id=c\n- [x] a | A').blocks
    expect(b?.options[0]?.value).toBe('a')
    expect(b?.tasks).toHaveLength(0)
    expect(b?.warnings.join(' ')).toContain('only @card and @board')
  })

  test('a card row with no checkbox is a todo plus a warning, never a dropped row', () => {
    const [b] = parseAnvil('@card id=c\n- ANV-1 | Something').blocks
    expect(b?.tasks[0]).toMatchObject({ state: 'todo', ref: 'ANV-1' })
    expect(b?.warnings.join(' ')).toContain('no [ ] state')
  })

  test('a wrapped header is caught, because otherwise it is invisible', () => {
    // §3.2 ends a header at the newline, so the second line was folded into the
    // prompt: the block lost `ask=` and gained a line of machine text as its
    // title, and said nothing about either.
    const [b] = parseAnvil('@message channel=email to="a@x"\n         from="b@x" ask="Send?"\n> hi').blocks
    expect(b?.warnings.join(' ')).toContain('wrapped @ header')
    // Prose that merely contains an `=` is not a wrapped header.
    expect(parseAnvil('@choice id=c\nx = y + 1\n- a | A').blocks[0]?.warnings).toEqual([])
  })

  test('an unknown checkbox character degrades to todo with a warning', () => {
    const [b] = parseAnvil('@card id=c\n- [z] ANV-1 | Something').blocks
    expect(b?.tasks[0]?.state).toBe('todo')
    expect(b?.warnings.join(' ')).toContain('unknown task state')
  })
})

describe('layout', () => {
  const GRID = `@grid cols=3 min=16rem
@card id=a
? A
- [x] one
@card id=b
? B
@end`

  test('a container holds its children instead of flattening them into the doc', () => {
    const doc = parseAnvil(GRID)
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]?.kind).toBe('grid')
    expect(doc.blocks[0]?.children.map(c => c.id)).toEqual(['a', 'b'])
  })

  test('a container has no id: layout is never stamped, voided or targeted', () => {
    const doc = parseAnvil('@grid id=nope\n@card id=a\n? A')
    expect(doc.blocks[0]?.id).toBe('')
    expect(doc.blocks[0]?.warnings.join(' ')).toContain('layout has no id')
  })

  test('a container title comes from ? rather than opening a note beside it', () => {
    const doc = parseAnvil('@stack\n? This sprint\n@card id=a\n? A')
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]?.prompt).toBe('This sprint')
    expect(doc.blocks[0]?.children).toHaveLength(1)
  })

  test('a stack nests inside a grid -- and a third level is flattened, not dropped', () => {
    const doc = parseAnvil('@grid\n@stack\n@grid\n@card id=deep\n? Deep\n@end\n@end\n@end')
    const stack = doc.blocks[0]?.children[0]
    expect(stack?.kind).toBe('stack')
    expect(stack?.children.map(c => c.id)).toEqual(['deep'])
    expect(stack?.warnings.join(' ')).toContain('flattened')
  })

  test('every @end still balances after a flattened level', () => {
    const doc = parseAnvil('@grid\n@stack\n@grid\n@card id=deep\n? Deep\n@end\n@end\n@card id=after\n? After')
    // The third @grid consumed the first @end; `after` therefore belongs to the grid.
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]?.children.map(c => c.kind)).toEqual(['stack', 'card'])
  })

  test('an unclosed container closes at the fence, the same as an unclosed ~~~', () => {
    const doc = parseAnvil('@grid cols=2\n@card id=a\n? A', { partial: true })
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]?.children).toHaveLength(1)
  })

  test('a container says so when it swallows a row it cannot draw', () => {
    // Options, fields, dials, prose and chips were parsed into a container and
    // then never rendered: content the agent wrote, gone without a trace.
    for (const row of ['- opt | O', '_ n | text', '% d | L | R', '+ chip', '> prose', ': sub']) {
      const doc = parseAnvil(`@grid\n${row}\n@end`)
      expect(doc.blocks[0]?.warnings.join(' ')).toContain('holds blocks')
    }
    // `?` is the one line a container does draw.
    expect(parseAnvil('@grid\n? Title\n@end').blocks[0]?.warnings).toEqual([])
  })

  test('deep nesting is bounded work, not quadratic', () => {
    // 60k containers took 5.7s and hung 60k warning strings off one block,
    // which white-screens a transcript as surely as the throw §11 forbids.
    const src = `${'@grid\n'.repeat(10_000)}@card id=a\n? A`
    const started = performance.now()
    const doc = parseAnvil(src)
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(500)
    const warnings = doc.blocks[0]?.children[0]?.warnings ?? []
    expect(warnings.length).toBeLessThanOrEqual(1)
  })

  test('a stray @end is visible, not silent', () => {
    const doc = parseAnvil('@end')
    expect(doc.blocks[0]?.warnings.join(' ')).toContain('stray @end')
  })

  test('a block after @end is a sibling of the container, not a child', () => {
    const doc = parseAnvil('@grid\n@card id=a\n? A\n@end\n@card id=b\n? B')
    expect(doc.blocks.map(b => b.kind)).toEqual(['grid', 'card'])
    expect(doc.blocks[1]?.id).toBe('b')
  })
})

export const FIXTURES = [
  CHOICE,
  CARD,
  '@grid cols=3 min=16rem\n@card id=a\n? A\n- [x] one\n@stack\n@note\n> hi\n@end\n@end',
  '@board id=s max=2\n? Sprint\n- [ ] a | A\n- [~] b | B\n- [x] c | C',
  '@gallery id=m render=image\n- a | A | img=https://x.test/a.jpg',
  '@input id=c\n_ a* | longtext | Notes',
  '@scale id=t steps=7\n% a | Lo | Hi | 2',
  '@note tone=warn\n> careful',
  '@choice id=x\n- a | A | b=|c\\| | img=',
]

export const HOSTILE = [
  '',
  '\n\n\n',
  '@',
  '@@@@',
  '- ',
  '_ ',
  '% ',
  '?',
  '#',
  '@choice id=\n- ',
  '@choice id="unclosed\n- a | A',
  '|||||',
  '\\|\\|\\|',
  '@choice\n- \\|',
  `@choice\n${'- a | A\n'.repeat(500)}`,
  '@scale\n% a | Lo | Hi | NaN',
  '@gallery\n- a | img=javascript:alert(1)',
  '@gallery\n- a | swatch=#fff;}</style><script>alert(1)</script>',
  '@end',
  '@end\n@end\n@end',
  '@card\n- [',
  '@card\n- []',
  '@card\n- [ ]',
  '@card\n- [ ] | | |',
  '@card\n- [x] a | b | 1/0',
  '@card\n- [x] a | b | 0/0',
  '@card\n>',
  '@card\n+',
  '@grid min=100vw;background:url(x)\n@card id=a',
  `@grid\n${'@stack\n'.repeat(200)}@card id=a`,
  `@card\n${'- [x] a\n'.repeat(500)}`,
]

describe('totality contract', () => {
  // The critical test. An LLM emits these token by token, so EVERY prefix of
  // a fence is a real input a renderer will see. A throw here is a broken page,
  // not a broken block.
  test('no prefix of any fixture can make the parser throw', () => {
    for (const fixture of FIXTURES) {
      for (let i = 0; i <= fixture.length; i++) {
        expect(() => parseAnvil(fixture.slice(0, i), { partial: true })).not.toThrow()
      }
    }
  })

  test('no prefix of any HOSTILE input can make the parser throw either', () => {
    // These used to get one flat not.toThrow() and no prefix walk, which is the
    // half of the contract that never actually gets exercised in production.
    for (const fixture of HOSTILE) {
      for (let i = 0; i <= fixture.length; i++) {
        expect(() => parseAnvil(fixture.slice(0, i), { partial: true })).not.toThrow()
      }
    }
  })

  test('hostile and degenerate input is survivable', () => {
    for (const src of HOSTILE) {
      expect(() => parseAnvil(src)).not.toThrow()
    }
  })

  test('a prototype key never reaches a value slot', () => {
    // `gap=constructor` substituted a function's source into the track formula.
    for (const src of [
      '@grid gap=constructor\n@note\n> x',
      '@grid gap=__proto__\n@note\n> x',
      '@note tone=toString\n> x',
      '@card id=c type=__proto__\n- [x] a',
      '@gallery id=g render=constructor\n- a | A',
    ]) {
      expect(() => parseAnvil(src)).not.toThrow()
    }
  })

  test('junk types do not throw', () => {
    for (const junk of [null, undefined, 42, {}, []]) {
      expect(() => parseAnvil(junk as unknown as string)).not.toThrow()
    }
  })
})
