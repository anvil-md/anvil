/**
 * SPEC.md must not lie about its own examples.
 *
 * §4.12.1 argues that a hand-typed progress number is worth banning from the
 * language because it can disagree with the rows underneath it. The first draft
 * of that section printed `3/7 · 43%` above five rows with two done. The
 * argument was right and the document was the counter-example.
 *
 * So: every ```anvil fence in SPEC.md is parsed, and the ``` picture that
 * follows it is checked against what the parser actually computes. A number in
 * the prose can no longer drift from a number in the source.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { lintMarkdown } from '../packages/lint/src/index'
import {
  type AnvilBlock,
  type AnvilDoc,
  chartDelta,
  chartRender,
  deltaText,
  flowGraph,
  parseAnvil,
  taskProgress,
} from '../packages/parser/src/index'

const ROOT = new URL('..', import.meta.url).pathname
const src = await readFile(join(ROOT, 'SPEC.md'), 'utf8')

interface Example {
  /** 1-based line of the ```anvil fence, so a failure points at the file. */
  line: number
  source: string
  /** The ``` block immediately after it, if there is one. */
  picture: string
}

/** Pull every ```anvil fence and the plain ``` block that follows it. */
function examples(md: string): Example[] {
  const lines = md.split('\n')
  const out: Example[] = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() !== '```anvil') continue
    const start = i
    const body: string[] = []
    i++
    while (i < lines.length && lines[i]?.trim() !== '```') body.push(lines[i] ?? ''), i++
    i++

    // Skip blank lines and one line of prose between the source and its picture.
    let j = i
    while (j < lines.length && lines[j]?.trim() === '') j++
    let picture = ''
    if (lines[j]?.trim() === '```') {
      j++
      const pic: string[] = []
      while (j < lines.length && lines[j]?.trim() !== '```') pic.push(lines[j] ?? ''), j++
      picture = pic.join('\n')
    }

    out.push({ line: start + 1, source: body.join('\n'), picture })
  }
  return out
}

function flatten(doc: AnvilDoc): AnvilBlock[] {
  const out: AnvilBlock[] = []
  const walk = (bs: AnvilBlock[]): void => {
    for (const b of bs) {
      out.push(b)
      walk(b.children)
    }
  }
  walk(doc.blocks)
  return out
}

const EXAMPLES = examples(src)

/** Everything from a `## N.` heading up to the next one. */
function section(md: string, heading: string): string {
  const start = md.indexOf(heading)
  if (start < 0) return ''
  const rest = md.slice(start + heading.length)
  const end = rest.search(/\n## /)
  return end < 0 ? rest : rest.slice(0, end)
}

/** The first fenced block inside a section. */
function firstFence(md: string): string {
  const m = /```[a-z]*\n([\s\S]*?)```/.exec(md)
  return m?.[1] ?? ''
}

function kindsIn(text: string): string[] {
  return [...text.matchAll(/@(\w+)/g)].map(m => m[1] as string)
}

/**
 * Not blocks: layout HOLDS blocks, and neither `@end` nor `@void` is a thing
 * that gets drawn. This is the split §2's own count sentence makes.
 */
const NOT_A_BLOCK = new Set(['grid', 'stack', 'end', 'void'])

const NUMERAL: Record<string, number> = {
  Ten: 10,
  Eleven: 11,
  Twelve: 12,
  Thirteen: 13,
  Fourteen: 14,
  Fifteen: 15,
  Sixteen: 16,
  Seventeen: 17,
  Eighteen: 18,
  Nineteen: 19,
  Twenty: 20,
}

/**
 * §2 must list every block §4 documents, and its count must be arithmetic.
 *
 * This drift has already shipped once. The @chart / @flow commit (3a18f4b)
 * added §4.16, §4.17 and the §13 reference card, and never touched §2 -- so
 * the vocabulary block a reader meets FIRST was missing two blocks, and the
 * "Thirteen blocks" underneath it had been wrong ever since.
 *
 * §13 is a cheatsheet somebody checks. §2 is the list they LEARN THE LANGUAGE
 * from, and "the set is closed on purpose" is the document's own argument --
 * which a stale list quietly undermines, because the closed set it shows is
 * not the set the spec defines.
 *
 * Only the FENCE is scanned, never the prose beneath it: that prose names
 * `@confirm`, `@yesno`, `@palette` and friends precisely to say they do NOT
 * exist, and counting them would invert the test.
 */
describe('SPEC.md vocabulary', () => {
  const listed = new Set(kindsIn(firstFence(section(src, '## 2. Vocabulary'))))
  const documented = [...src.matchAll(/^### 4\.\d+ (.+)$/gm)].flatMap(m => kindsIn(m[1] ?? ''))

  test('§2 lists every block §4 documents', () => {
    expect([...new Set(documented)].filter(k => !listed.has(k)).sort()).toEqual([])
  })

  test('§2 documents nothing §4 never defines', () => {
    const defined = new Set(documented)
    // `@end` closes a container and earns no section of its own.
    expect([...listed].filter(k => k !== 'end' && !defined.has(k)).sort()).toEqual([])
  })

  test('the count under §2 is the number of blocks in it', () => {
    const m = /^(\w+) blocks, (\w+) containers and (\w+) directive/m.exec(src)
    expect(m).not.toBeNull()

    const blocks = [...listed].filter(k => !NOT_A_BLOCK.has(k))
    expect(NUMERAL[m?.[1] ?? '']).toBe(blocks.length)
  })
})

describe('SPEC.md examples', () => {
  test('the document contains examples to check', () => {
    expect(EXAMPLES.length).toBeGreaterThan(8)
  })

  /**
   * Specified but not yet in the reference parser.
   *
   * Written down rather than skipped past: this list IS the gap between §2 and
   * `packages/parser`, and the test breaks the day one of them lands, which is
   * the moment somebody should delete the entry.
   */
  const UNIMPLEMENTED = ['code', 'upload', 'link', 'order', 'example', 'void', 'connect']

  test('the reference parser is behind the spec by exactly the documented set', () => {
    const missing = new Set<string>()
    for (const ex of EXAMPLES) {
      for (const b of flatten(parseAnvil(ex.source))) {
        for (const w of b.warnings) {
          const m = /^unknown block "@(\w+)"$/.exec(w)
          if (m?.[1]) missing.add(m[1])
        }
      }
    }
    expect([...missing].sort()).toEqual([...UNIMPLEMENTED].sort())
  })

  test('every example of an IMPLEMENTED block parses clean', () => {
    const complaints: string[] = []
    for (const ex of EXAMPLES) {
      for (const b of flatten(parseAnvil(ex.source))) {
        const unimplemented = b.warnings.some(w => UNIMPLEMENTED.some(k => w === `unknown block "@${k}"`))
        if (unimplemented) continue
        if (b.warnings.length) complaints.push(`SPEC.md:${ex.line} @${b.kind}: ${b.warnings.join(' · ')}`)
      }
    }
    expect(complaints).toEqual([])
  })

  test('every counted number in a picture matches what the parser computes', () => {
    const wrong: string[] = []

    for (const ex of EXAMPLES) {
      if (!ex.picture) continue
      const counted = flatten(parseAnvil(ex.source)).filter(b => b.tasks.length > 0)
      if (!counted.length) continue

      // Every `n/m` and `n/m · p%` the picture claims, in order of appearance.
      const claims = [...ex.picture.matchAll(/(\d+)\s*\/\s*(\d+)(?:\s*·\s*(\d+)%)?/g)]
      if (!claims.length) continue

      // The set of ratios the source can honestly produce: each block's own
      // total, plus every child rollup drawn beside a row.
      const honest = new Set<string>()
      for (const b of counted) {
        const p = taskProgress(b)
        honest.add(`${p.done}/${p.total}`)
        for (const t of b.tasks) {
          if (t.total !== undefined) honest.add(`${t.done}/${t.total}`)
        }
      }

      for (const c of claims) {
        const ratio = `${c[1]}/${c[2]}`
        if (!honest.has(ratio)) {
          wrong.push(`SPEC.md:${ex.line} picture claims ${ratio}, source can only produce ${[...honest].join(', ')}`)
          continue
        }
        // And when it prints a percentage, the percentage must follow.
        if (c[3] !== undefined) {
          const done = Number(c[1])
          const total = Number(c[2])
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          if (Number(c[3]) !== pct) {
            wrong.push(`SPEC.md:${ex.line} picture says ${ratio} · ${c[3]}%, but ${ratio} is ${pct}%`)
          }
        }
      }
    }

    expect(wrong).toEqual([])
  })

  test('the specification lints clean against its own linter', () => {
    // Dogfood. If a rule fires on the document that defines the rule, one of
    // the two is wrong -- and finding out which is exactly the argument for
    // having a linter. (This caught `danger-needs-a-phrase` firing on §4.1's
    // own `- !scrap` row, which turned out to be the rule, not the example.)
    const report = lintMarkdown(src, 'SPEC.md')
    const real = report.fences.flatMap(f =>
      f.result.diagnostics.filter(
        d => !(d.rule === 'parse-warning' && UNIMPLEMENTED.some(k => d.message === `unknown block "@${k}"`)),
      ),
    )
    expect(real.map(d => `${d.rule}: ${d.message}`)).toEqual([])
  })

  /**
   * The same rule for §4.16, arriving from the other direction.
   *
   * A `@card` picture can lie by printing a count the rows do not add up to.
   * A `@chart` picture can lie by printing a VALUE no row contains -- and it is
   * an easier mistake, because the numbers in the ASCII are typed next to bars
   * whose lengths were also typed by hand. §4.16.1 says the printed value is
   * what the agent wrote, so the check is exact: every number beside a bar must
   * be a number in the source.
   */
  test('every value in a chart picture is a value in its source', () => {
    const wrong: string[] = []

    for (const ex of EXAMPLES) {
      if (!ex.picture) continue
      const charts = flatten(parseAnvil(ex.source)).filter(b => b.kind === 'chart' && b.data.length > 0)
      if (!charts.length) continue

      const honest = new Set<string>()
      for (const b of charts) {
        const unit = typeof b.attrs.unit === 'string' ? b.attrs.unit : ''
        for (const d of b.data) {
          honest.add(d.raw)
          if (unit) honest.add(`${d.raw}${unit}`)
        }
      }

      // Numbers that carry the chart's unit, or sit alone in a value column.
      // Bare integers elsewhere in a picture are frame decoration, not claims.
      for (const b of charts) {
        const unit = typeof b.attrs.unit === 'string' ? b.attrs.unit : ''
        if (!unit) continue
        for (const m of ex.picture.matchAll(new RegExp(`([\\d.,]+)\\s?${unit}\\b`, 'g'))) {
          const claim = `${m[1]}${unit}`
          if (!honest.has(claim)) {
            wrong.push(`SPEC.md:${ex.line} picture prints ${claim}, source has ${[...honest].join(', ')}`)
          }
        }
      }
    }

    expect(wrong).toEqual([])
  })

  /**
   * §4.16.5 bans a hand-typed change for the reason §4.12.1 bans a hand-typed
   * count, so the picture of a stat is held to the same rule: every change it
   * prints is one the parser computes, and nothing that looks like one is
   * printed that the parser would not produce.
   */
  test('every change in a stat picture is the change its source computes', () => {
    const wrong: string[] = []

    for (const ex of EXAMPLES) {
      if (!ex.picture) continue
      const stats = flatten(parseAnvil(ex.source)).filter(b => b.kind === 'chart' && chartRender(b) === 'stat')
      if (!stats.length) continue

      const honest = new Set<string>()
      for (const b of stats) {
        const unit = typeof b.attrs.unit === 'string' ? b.attrs.unit : ''
        for (const d of b.data) {
          const delta = chartDelta(b, d)
          if (!delta) continue
          const text = deltaText(d, delta, unit)
          honest.add(text)
          if (!ex.picture.includes(text)) wrong.push(`SPEC.md:${ex.line} picture never prints "${d.label}" ${text}`)
          if (!ex.picture.includes(`from ${d.wasRaw}`)) wrong.push(`SPEC.md:${ex.line} picture never prints "from ${d.wasRaw}"`)
        }
      }

      for (const m of ex.picture.matchAll(/[+-][\d.,]+[kmb]?(?: · [+-][\d.]+%)?/g)) {
        if (![...honest].some(h => h.startsWith(m[0]))) {
          wrong.push(`SPEC.md:${ex.line} picture prints ${m[0]}, source computes ${[...honest].join(', ')}`)
        }
      }
    }

    expect(wrong).toEqual([])
  })

  /**
   * And that a flow picture draws the steps the source declares.
   *
   * The failure this catches is editing a fence and forgetting the ASCII beside
   * it, which is exactly how §4.12 ended up printing `3/7` over five rows.
   */
  test('every box in a flow picture is a node in its source', () => {
    const missing: string[] = []

    for (const ex of EXAMPLES) {
      if (!ex.picture) continue
      const flows = flatten(parseAnvil(ex.source)).filter(b => b.kind === 'flow')
      for (const b of flows) {
        for (const n of flowGraph(b).nodes) {
          // The picture draws LABELS, and a long one is legitimately cut, so
          // the check is on a prefix rather than the whole string.
          const drawn = n.label.slice(0, 10)
          if (!ex.picture.includes(drawn)) {
            missing.push(`SPEC.md:${ex.line} flow picture never draws "${n.label}"`)
          }
        }
      }
    }

    expect(missing).toEqual([])
  })

  test('a lane count in a picture matches the rows in its source', () => {
    const wrong: string[] = []

    for (const ex of EXAMPLES) {
      if (!ex.picture) continue
      const boards = flatten(parseAnvil(ex.source)).filter(b => b.kind === 'board')
      if (!boards.length) continue

      for (const b of boards) {
        const counts = taskProgress(b).counts
        for (const [label, state] of [
          ['TODO', 'todo'],
          ['IN FLIGHT', 'flight'],
          ['DONE', 'done'],
          ['BLOCKED', 'blocked'],
        ] as const) {
          const m = new RegExp(`${label}\\s+(\\d+)`).exec(ex.picture)
          if (m && Number(m[1]) !== counts[state]) {
            wrong.push(`SPEC.md:${ex.line} lane ${label} drawn as ${m[1]}, source has ${counts[state]}`)
          }
        }
      }
    }

    expect(wrong).toEqual([])
  })
})
