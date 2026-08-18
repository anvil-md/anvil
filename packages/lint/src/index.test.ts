import { describe, expect, test } from 'bun:test'
import { parseAnvil } from '@anvil-md/parser'
import { fences, lint, lintDoc, lintMarkdown, RULE_IDS, RULES } from './index'

/** The rules a source trips, ignoring the parser's own warnings. */
function rules(src: string): string[] {
  return [...new Set(lint(src, { skipParseWarnings: true }).diagnostics.map(d => d.rule))].sort()
}

function messageFor(src: string, rule: string): string {
  return (
    lint(src)
      .diagnostics.filter(d => d.rule === rule)
      .map(d => d.message)
      .join(' | ') || '<none>'
  )
}

describe('the rule set itself', () => {
  test('every rule has a unique id, a spec section and a description', () => {
    expect(new Set(RULE_IDS).size).toBe(RULES.length)
    for (const r of RULES) {
      expect(r.spec, `${r.id} names no section`).toMatch(/^\d+(\.\d+)*$/)
      expect(r.about.length, `${r.id} has no description`).toBeGreaterThan(10)
      expect(['error', 'warn', 'info']).toContain(r.severity)
    }
  })

  test('a clean document trips nothing at all', () => {
    const clean = `@card id=ANV-1 type=story as=14:02
? Payment retry ladder
+ 5 pts | Sprint 24
- [x] ANV-2 | Retry scheduler | Ana
- [~] ANV-3 | Dead-letter queue | Kit
- [ ] ANV-4 | Metrics`
    expect(lint(clean).diagnostics).toEqual([])
  })

  test('a rule that throws is contained, not fatal', () => {
    // The linter runs over agent-authored text; one bad rule must not take the
    // process down, so it becomes a diagnostic about itself.
    const boom = {
      id: 'explodes',
      severity: 'warn' as const,
      spec: '1',
      about: 'always throws, for the test',
      run: () => {
        throw new Error('kaboom')
      },
    }
    RULES.push(boom)
    try {
      const out = lintDoc(parseAnvil('@note\n> x'))
      expect(out.diagnostics.some(d => d.rule === 'explodes' && d.message.includes('kaboom'))).toBe(true)
      expect(out.ok).toBe(true)
    } finally {
      RULES.pop()
    }
  })
})

describe('errors', () => {
  test('two blocks cannot share an id', () => {
    expect(rules('@choice id=x\n? A\n- a | A\n@choice id=x\n? B\n- b | B')).toContain('no-duplicate-id')
    // A derived id is content-addressed, so two identical blocks legitimately
    // collide and that is not the author's mistake.
    expect(rules('@note\n> a\n@note\n> a')).not.toContain('no-duplicate-id')
  })

  test('a phantom progress attribute is an error, not a shrug', () => {
    for (const attr of ['progress=50', 'done=3', 'total=7', 'pct=42', 'completed=3']) {
      expect(rules(`@card id=c ${attr}\n- [ ] a`), attr).toContain('no-authored-progress')
    }
    expect(messageFor('@card id=c progress=50\n- [ ] a', 'no-authored-progress')).toContain('counted from the rows')
  })

  test('a card asking what is next must have an open row', () => {
    expect(rules('@card id=c ask="Next?"\n- [x] a\n- [!] b')).toContain('ask-needs-something-to-pick')
    expect(rules('@card id=c ask="Next?"\n- [x] a\n- [ ] b')).not.toContain('ask-needs-something-to-pick')
  })

  test('a send gate needs a recipient and a body', () => {
    expect(rules('@message ask="Send?"\n> hi')).toContain('message-needs-a-recipient')
    expect(rules('@message to=a@x ask="Send?"\n> hi')).not.toContain('message-needs-a-recipient')
    expect(rules('@message to=a@x ask="Send?"\n? Subject only')).toContain('message-body-is-required')
  })

  test('an unrecognised state falls back to draft, loudly', () => {
    expect(messageFor('@message to=a@x state=posted\n> hi', 'message-state-is-known')).toContain('drawn as draft')
    for (const s of ['draft', 'approved', 'sent', 'failed', 'declined']) {
      expect(rules(`@message to=a@x state=${s} ask="Send?" at=1 error=x\n> hi`), s).not.toContain(
        'message-state-is-known',
      )
    }
  })

  test('an outcome with no question attached to it', () => {
    // The receipt is built from ask=; without it a stamped message shows an
    // answer to nothing.
    expect(rules('@message to=a@x state=sent at=14:07\n> hi')).toContain('message-locked-needs-no-gate')
    expect(rules('@message to=a@x state=sent at=14:07 ask="Send?"\n> hi')).not.toContain('message-locked-needs-no-gate')
  })

  test('a terminal state should carry its timestamp', () => {
    expect(rules('@message to=a@x state=sent ask="Send?"\n> hi')).toContain('message-outcome-needs-a-time')
    expect(rules('@message to=a@x state=sent at=14:07 ask="Send?"\n> hi')).not.toContain('message-outcome-needs-a-time')
    // sent=<time> is the sugar, and it counts.
    expect(rules('@message to=a@x sent=14:07 ask="Send?"\n> hi')).not.toContain('message-outcome-needs-a-time')
  })

  test('a failure has to say what broke', () => {
    expect(rules('@message to=a@x state=failed at=1 ask="Send?"\n> hi')).toContain('message-failure-says-why')
    expect(rules('@message to=a@x error="550 mailbox unavailable" at=1 ask="Send?"\n> hi')).not.toContain(
      'message-failure-says-why',
    )
  })
})

describe('warnings', () => {
  test('destructive framing without a phrase', () => {
    expect(rules('@choice id=c danger\n? Q\n- a | A')).toContain('danger-needs-a-phrase')
    expect(rules('@choice id=c danger phrase=DELETE\n? Q\n- a | A')).not.toContain('danger-needs-a-phrase')
    // One `!` row among several is an ordinary question with one destructive
    // option, not a destructive block. §4.1's own example is written this way.
    expect(rules('@choice id=c\n? Q\n- keep | Keep\n- !wipe | Wipe')).not.toContain('danger-needs-a-phrase')
  })

  test('two questions in a grid is a form', () => {
    const form = '@grid cols=2\n@choice id=a\n? A\n- x | X\n@scale id=b\n? B\n% d | L | R\n@end'
    expect(rules(form)).toContain('no-question-in-a-grid')
    // Records side by side are exactly what a grid is for.
    const records = '@grid cols=2\n@card id=a\n? A\n- [ ] x\n@card id=b\n? B\n- [ ] y\n@end'
    expect(rules(records)).not.toContain('no-question-in-a-grid')
  })

  test('an ASK attribute on a record says so specifically', () => {
    expect(messageFor('@card id=c expires=30s\n- [ ] a', 'unknown-attribute')).toContain('not asking anything')
    expect(rules('@card id=c ask="Which?" select=many\n- [ ] a')).not.toContain('unknown-attribute')
  })

  test('an attribute the block cannot read is a silent no-op', () => {
    expect(messageFor('@grid rows=3\n@note\n> x', 'unknown-attribute')).toContain('"rows="')
    expect(rules('@grid cols=3 min=16rem gap=tight frame\n@note\n> x')).not.toContain('unknown-attribute')
  })

  test('empty blocks and empty containers', () => {
    expect(rules('@choice id=c\n? Q')).toContain('no-empty-block')
    expect(rules('@grid\n@end')).toContain('no-empty-container')
    // A note is prose and a message is a body; neither has rows to miss.
    expect(rules('@note\n> hi')).not.toContain('no-empty-block')
  })

  test('a min= nobody can satisfy', () => {
    expect(rules('@choice id=c select=many min=5\n? Q\n- a | A\n- b | B')).toContain('multi-select-bounds')
  })

  test('an unknown channel is flagged with the list of known ones', () => {
    expect(messageFor('@message channel=pigeon to=a@x\n> hi', 'message-channel-is-known')).toContain('whatsapp')
  })
})

describe('info', () => {
  test('a grid of one', () => {
    expect(rules('@grid\n@note\n> x\n@end')).toContain('grid-of-one')
  })

  test('a blocked row with no reason', () => {
    expect(rules('@card id=c\n- [!] ANV-1 | Thing')).toContain('blocked-row-should-say-why')
    expect(rules('@card id=c\n- [!] ANV-1 | Thing | waiting on infra')).not.toContain('blocked-row-should-say-why')
    expect(rules('@card id=c\n- [!] ANV-1 | Thing\n> waiting on infra')).not.toContain('blocked-row-should-say-why')
  })

  test('a rollup mixed with bare rows', () => {
    expect(rules('@card id=e\n- [~] A | a | 3/7\n- [x] B | b')).toContain('epic-rollup-is-consistent')
    expect(rules('@card id=e\n- [~] A | a | 3/7\n- [x] B | b | 6/6')).not.toContain('epic-rollup-is-consistent')
  })

  test('option counts', () => {
    const many = `@choice id=c\n? Q\n${Array.from({ length: 7 }, (_, i) => `- o${i} | O${i}`).join('\n')}`
    expect(rules(many)).toContain('too-many-options')
    // A gallery earns two more, because a card is faster to scan than a row.
    const gallery = `@gallery id=g\n? Q\n${Array.from({ length: 7 }, (_, i) => `- o${i} | O${i}`).join('\n')}`
    expect(rules(gallery)).not.toContain('too-many-options')
  })
})

describe('parse warnings are folded in', () => {
  test('lint is a superset of what the parser said', () => {
    const out = lint('@card id=c\n- [z] ANV-1 | Thing')
    expect(out.diagnostics.some(d => d.rule === 'parse-warning' && d.message.includes('unknown task state'))).toBe(true)
  })

  test('rules see inside a container', () => {
    const out = lint('@grid\n@card id=c progress=9\n- [ ] a\n@end')
    expect(out.diagnostics.some(d => d.rule === 'no-authored-progress')).toBe(true)
  })

  test('off= silences a rule without silencing the rest', () => {
    const src = '@grid\n@note\n> x\n@end'
    expect(rules(src)).toContain('grid-of-one')
    expect(lint(src, { off: ['grid-of-one'] }).diagnostics.some(d => d.rule === 'grid-of-one')).toBe(false)
  })

  test('ok tracks errors only', () => {
    expect(lint('@grid\n@note\n> x\n@end').ok).toBe(true)
    expect(lint('@choice id=x\n? A\n- a | A\n@choice id=x\n? B\n- b | B').ok).toBe(false)
  })
})

describe('fence extraction', () => {
  const md = `Some prose.

\`\`\`anvil
@choice id=a
? Q
- a | A
\`\`\`

\`\`\`ts
const x = 1
\`\`\`

\`\`\`\`anvil
@code lang=md
~~~
\`\`\`anvil
@note
> nested, and not a fence terminator
~~~
\`\`\`\`
`

  test('finds anvil fences and skips everything else', () => {
    const found = fences(md)
    expect(found).toHaveLength(2)
    expect(found[0]?.source).toContain('@choice id=a')
    expect(found[0]?.line).toBe(3)
  })

  test('a longer opening delimiter is not closed by a shorter one', () => {
    // §4.4: an anvil fence can contain a literal that contains backticks.
    const found = fences(md)
    expect(found[1]?.source).toContain('nested, and not a fence terminator')
  })

  test('an unclosed fence runs to the end rather than being dropped', () => {
    expect(fences('```anvil\n@note\n> hi')[0]?.source).toBe('@note\n> hi')
  })

  test('lintMarkdown reports per fence, with a line to click', () => {
    const report = lintMarkdown('x\n\n```anvil\n@card id=c progress=9\n- [ ] a\n```\n', 'doc.md')
    expect(report.file).toBe('doc.md')
    expect(report.fences[0]?.line).toBe(3)
    expect(report.ok).toBe(false)
    expect(report.counts.error).toBeGreaterThan(0)
  })
})

describe('totality', () => {
  const HOSTILE = [
    '',
    '@',
    '@end',
    '@grid\n'.repeat(50),
    '@card\n- [',
    '@message\n+',
    '@choice id=x\n@choice id=x\n@choice id=x',
    '|||||',
    '@card id=c progress=constructor\n- [ ] a',
    '@grid gap=__proto__\n@end',
  ]

  test('nothing in the rule set throws, whatever it is handed', () => {
    for (const src of HOSTILE) expect(() => lint(src), JSON.stringify(src)).not.toThrow()
  })

  test('no prefix of a hostile input throws either', () => {
    for (const src of HOSTILE) {
      for (let i = 0; i <= src.length; i++) expect(() => lint(src.slice(0, i))).not.toThrow()
    }
  })

  test('junk is survivable', () => {
    for (const junk of [null, undefined, 42, {}, []]) {
      expect(() => lint(junk as unknown as string)).not.toThrow()
      expect(() => fences(junk as unknown as string)).not.toThrow()
    }
  })
})
