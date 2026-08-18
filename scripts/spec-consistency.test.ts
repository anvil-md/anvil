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
import { type AnvilBlock, type AnvilDoc, parseAnvil, taskProgress } from '../packages/parser/src/index'

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
  const UNIMPLEMENTED = ['code', 'upload', 'link', 'order', 'example', 'void']

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
