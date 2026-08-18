/**
 * The reference implementation, run against the corpus.
 *
 * Every case gets four things whether it asks for them or not:
 *   1. the declared expectations;
 *   2. no throw, on the whole source;
 *   3. no throw, on EVERY PREFIX of the source (§5 -- a fence arrives token by
 *      token, so every prefix is a real input a renderer will see);
 *   4. no throw in the renderer, on every prefix, for the same reason.
 *
 * (3) and (4) are the reason a corpus beats a pile of hand-written tests: every
 * case added for a feature also becomes a totality case, for free.
 */
import { describe, expect, test } from 'bun:test'
import { type AnvilBlock, type AnvilDoc, parseAnvil, taskProgress } from '@anvil-md/parser'
import { renderAnvilFence } from '@anvil-md/render-html'
import { type BlockExpectation, cases, coveredSections, CORPUS } from './index'

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

function depth(blocks: AnvilBlock[], at = 0): number {
  let deepest = at
  for (const b of blocks) {
    if (!b.children.length) continue
    deepest = Math.max(deepest, depth(b.children, at + 1))
  }
  return deepest
}

function checkBlock(actual: AnvilBlock, want: BlockExpectation, where: string): void {
  const at = (what: string) => `${where} ${what}`

  // The corpus is plain JSON, so every expectation is a widened `string`. The
  // actual side is narrowed to unions; compare as strings on purpose, or an
  // implementation that adds a kind cannot express it in the corpus.
  if (want.kind !== undefined) expect(String(actual.kind), at('kind')).toBe(want.kind)
  if (want.id !== undefined) expect(actual.id, at('id')).toBe(want.id)
  if (want.derivedId !== undefined) expect(actual.derivedId, at('derivedId')).toBe(want.derivedId)
  if (want.prompt !== undefined) expect(actual.prompt, at('prompt')).toBe(want.prompt)
  if (want.subtext !== undefined) expect(actual.subtext, at('subtext')).toBe(want.subtext)

  if (want.optionValues) expect(actual.options.map(o => o.value), at('option values')).toEqual(want.optionValues)
  if (want.optionLabels) expect(actual.options.map(o => o.label), at('option labels')).toEqual(want.optionLabels)

  if (want.taskStates) expect(actual.tasks.map(t => String(t.state)), at('task states')).toEqual(want.taskStates)
  if (want.taskRefs) expect(actual.tasks.map(t => t.ref), at('task refs')).toEqual(want.taskRefs)
  if (want.taskLabels) expect(actual.tasks.map(t => t.label), at('task labels')).toEqual(want.taskLabels)
  if (want.taskMeta) expect(actual.tasks.map(t => t.meta), at('task meta')).toEqual(want.taskMeta)
  if (want.taskDetails) expect(actual.tasks.map(t => t.detail), at('task details')).toEqual(want.taskDetails)
  if (want.taskRollups) {
    const got = actual.tasks.map(t => (t.total === undefined ? null : `${t.done}/${t.total}`))
    expect(got, at('task rollups')).toEqual(want.taskRollups)
  }
  if (want.meta) expect(actual.meta, at('meta rows')).toEqual(want.meta)

  if (want.progress) {
    const p = taskProgress(actual)
    for (const [k, v] of Object.entries(want.progress)) {
      expect(p[k as keyof typeof p], at(`progress.${k}`)).toBe(v as never)
    }
  }
}

describe('conformance corpus', () => {
  test('the corpus is well formed and every case id is unique', () => {
    expect(CORPUS.version).toBe(1)
    const ids = cases().map(c => c.id)
    expect(new Set(ids).size, 'duplicate case id').toBe(ids.length)
    for (const c of cases()) {
      expect(c.spec, `${c.id} names no spec section`).toBeTruthy()
      expect(c.title.length, `${c.id} has no title`).toBeGreaterThan(0)
    }
  })

  test('no case asserts nothing', () => {
    // A case whose `expect` has no keys the runner reads is a green test that
    // proves nothing, and it is invisible in a passing suite.
    const vacuous: string[] = []
    for (const c of cases()) {
      const e = c.expect
      const asserts =
        (e.blocks?.length ?? 0) > 0 ||
        e.topLevelKinds !== undefined ||
        (e.tree?.length ?? 0) > 0 ||
        e.maxDepth !== undefined ||
        e.warnings !== undefined ||
        (e.warningsContain?.length ?? 0) > 0 ||
        (e.htmlContains?.length ?? 0) > 0 ||
        (e.htmlExcludes?.length ?? 0) > 0 ||
        Object.keys(e.htmlCount ?? {}).length > 0 ||
        e.neverThrows === true
      if (!asserts) vacuous.push(c.id)
    }
    expect(vacuous).toEqual([])
  })

  test('the runner actually compares -- a wrong expectation fails', () => {
    // Guards the guard. If checkBlock ever stops reading a key, this catches it
    // rather than the whole corpus quietly going green.
    const doc = parseAnvil('@card id=c\n- [x] a\n- [ ] b')
    const block = doc.blocks[0] as AnvilBlock
    expect(() => checkBlock(block, { taskStates: ['done', 'todo'] }, 'self')).not.toThrow()
    expect(() => checkBlock(block, { taskStates: ['todo', 'todo'] }, 'self')).toThrow()
    expect(() => checkBlock(block, { progress: { done: 9 } }, 'self')).toThrow()
    expect(() => checkBlock(block, { taskRollups: ['1/2', null] }, 'self')).toThrow()
  })

  test('the corpus covers every section that defines a block', () => {
    const covered = coveredSections()
    // Not "every section" -- §6 and §7 are stamping, which the reference
    // implementation does not ship. These are the ones it can be held to.
    for (const s of ['4.1', '4.3', '4.5', '4.8', '4.12.1', '4.13', '4.14', '4.15.1', '8.3', '11']) {
      expect(covered, `no case pins §${s}`).toContain(s)
    }
  })

  for (const c of cases()) {
    describe(`${c.id} (§${c.spec})`, () => {
      const doc = parseAnvil(c.source, { partial: c.partial === true })
      const all = flatten(doc)
      const html = renderAnvilFence(c.source, c.partial !== true)
      const e = c.expect

      test(c.title, () => {
        if (e.topLevelKinds) expect(doc.blocks.map(b => String(b.kind))).toEqual(e.topLevelKinds)

        if (e.blocks) {
          for (const [i, want] of e.blocks.entries()) {
            const actual = doc.blocks[i]
            expect(actual, `${c.id}: no block at index ${i}`).toBeDefined()
            checkBlock(actual as AnvilBlock, want, `${c.id} block[${i}]`)
          }
        }

        if (e.tree) {
          for (const [i, want] of e.tree.entries()) {
            const actual = doc.blocks[i]
            expect(String(actual?.kind), `${c.id} tree[${i}] kind`).toBe(want.kind)
            expect(actual?.children.map(x => x.id), `${c.id} tree[${i}] children`).toEqual(want.children)
          }
        }

        if (e.maxDepth !== undefined) expect(depth(doc.blocks)).toBeLessThanOrEqual(e.maxDepth)

        const warnings = all.flatMap(b => b.warnings)
        if (e.warnings) expect(warnings, `${c.id} expected no warnings`).toEqual(e.warnings)
        for (const needle of e.warningsContain ?? []) {
          expect(warnings.join(' · '), `${c.id} missing warning`).toContain(needle)
        }

        for (const needle of e.htmlContains ?? []) expect(html, `${c.id} html missing`).toContain(needle)
        for (const needle of e.htmlExcludes ?? []) expect(html, `${c.id} html leaked`).not.toContain(needle)
        for (const [needle, n] of Object.entries(e.htmlCount ?? {})) {
          const found = html.split(needle).length - 1
          expect(found, `${c.id} count of ${JSON.stringify(needle)}`).toBe(n)
        }

        if (c.sameDerivedIdAs !== undefined) {
          const other = parseAnvil(c.sameDerivedIdAs).blocks
          const mine = doc.blocks.filter(b => b.derivedId).map(b => b.id)
          const theirs = other.filter(b => b.derivedId).map(b => b.id)
          // Content decides the id, never position (§11).
          expect(mine.some(id => theirs.includes(id)), `${c.id} derived ids drifted`).toBe(true)
        }
      })

      // Every case is also a totality case. This is the point of the corpus.
      test('no prefix of the source makes the parser or the renderer throw', () => {
        for (let i = 0; i <= c.source.length; i++) {
          const slice = c.source.slice(0, i)
          expect(() => parseAnvil(slice, { partial: true })).not.toThrow()
          expect(() => renderAnvilFence(slice, false)).not.toThrow()
        }
      })
    })
  }
})
