/**
 * A preset is the first ANVIL most visitors edit, so it is held to the examples
 * page's standard: it lints clean. `broken` is the one preset whose job is to be
 * wrong, and it has to stay wrong or the parse report has nothing to show.
 */
import { describe, expect, test } from 'bun:test'
import { lint } from '@anvil-md/lint'
import { DEFAULT_SOURCE, PRESETS } from './playground'

const DELIBERATELY_BROKEN = 'broken'

describe('playground presets', () => {
	test('ids are unique', () => {
		const ids = PRESETS.map((p) => p.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	for (const p of [
		...PRESETS.filter((p) => p.id !== DELIBERATELY_BROKEN),
		{ id: 'default', source: DEFAULT_SOURCE },
	]) {
		test(`${p.id} lints clean`, () => {
			const { diagnostics } = lint(p.source)
			expect(diagnostics.map((d) => `${d.severity} ${d.rule}: ${d.message}`)).toEqual([])
		})
	}

	test('the malformed preset stays malformed', () => {
		const broken = PRESETS.find((p) => p.id === DELIBERATELY_BROKEN)
		expect(broken, 'the malformed preset has been renamed or removed').toBeDefined()
		expect(lint(broken?.source ?? '').diagnostics.length).toBeGreaterThan(3)
	})
})
