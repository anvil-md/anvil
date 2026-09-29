/**
 * The examples page teaches the language, so it must not teach a version of it
 * the linter rejects.
 *
 * Every source in the catalogue is parsed, linted and rendered here. The one
 * deliberate exception is the `degrading` example, whose entire job is to be
 * wrong -- and it is held to the opposite standard: it has to STAY wrong, or it
 * stops demonstrating anything.
 */
import { describe, expect, test } from 'bun:test'
import { lint } from '@anvil-md/lint'
import { type AnvilBlock, parseAnvil } from '@anvil-md/parser'
import { renderAnvilFence } from '@anvil-md/render-html'
import { EXAMPLES, GROUPS } from './examples'
import { DEMO_HOST } from './faces'

/** The one example that is supposed to fail every rule it touches. */
const DELIBERATELY_BROKEN = 'degrading'

const clean = EXAMPLES.filter(e => e.id !== DELIBERATELY_BROKEN)

function flatten(blocks: AnvilBlock[]): AnvilBlock[] {
	return blocks.flatMap(b => [b, ...flatten(b.children)])
}

describe('the example catalogue', () => {
	test('ids are unique and every example names a spec section', () => {
		const ids = EXAMPLES.map(e => e.id)
		expect(new Set(ids).size).toBe(ids.length)
		const groupIds = GROUPS.map(g => g.id)
		expect(new Set(groupIds).size).toBe(groupIds.length)
		for (const e of EXAMPLES) {
			expect(e.spec, `${e.id} names no section`).toMatch(/^\d+(\.\d+)*$/)
			expect(e.note.length, `${e.id} has no note`).toBeGreaterThan(40)
		}
	})

	test('every example covers a block the page claims to cover', () => {
		const kinds = new Set(EXAMPLES.flatMap(e => flatten(parseAnvil(e.source).blocks).map(b => b.kind)))
		// If a block ships and the examples page never draws it, the page is
		// lying about being the whole language.
		for (const kind of ['choice', 'gallery', 'input', 'scale', 'note', 'card', 'board', 'message', 'grid', 'stack']) {
			expect(kinds, `no example renders @${kind}`).toContain(kind)
		}
	})
})

describe('every example is valid ANVIL', () => {
	for (const ex of clean) {
		test(`${ex.id} lints clean`, () => {
			const { diagnostics } = lint(ex.source)
			expect(diagnostics.map(d => `${d.severity} ${d.rule}: ${d.message}`)).toEqual([])
		})
	}

	test('the broken example stays broken', () => {
		const broken = EXAMPLES.find(e => e.id === DELIBERATELY_BROKEN)
		expect(broken, 'the degrading example has been renamed or removed').toBeDefined()
		const { diagnostics } = lint(broken?.source ?? '')
		// It demonstrates §11, so it needs to actually produce complaints -- and
		// it needs to still RENDER, because that is the whole point.
		expect(diagnostics.length).toBeGreaterThan(4)
		expect(renderAnvilFence(broken?.source ?? '', true)).toContain('anvil-warn')
	})
})

describe('every example renders', () => {
	for (const ex of EXAMPLES) {
		test(`${ex.id} produces blocks and never throws`, () => {
			const html = renderAnvilFence(ex.source, true)
			expect(html).toContain('anvil-doc')
			expect(html).not.toContain('anvil-fallback')
			expect(parseAnvil(ex.source).blocks.length).toBeGreaterThan(0)

			// The page is static, so a prefix never reaches it -- but the source is
			// copied into the playground by hand, where every prefix does.
			for (let i = 0; i <= ex.source.length; i += 7) {
				expect(() => renderAnvilFence(ex.source.slice(0, i), false)).not.toThrow()
			}
		})
	}
})
