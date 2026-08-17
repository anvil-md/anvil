import { describe, expect, test } from 'bun:test'
import { anvilMarked, isFenceClosed, renderAnvilToken } from './index'

const BODY = '@choice id=x\n? Q\n- a | A'

describe('isFenceClosed', () => {
	test('true when the raw token ends with a closing delimiter', () => {
		expect(isFenceClosed({ text: BODY, lang: 'anvil', raw: '```anvil\n' + BODY + '\n```' })).toBe(true)
		expect(isFenceClosed({ text: BODY, lang: 'anvil', raw: '```anvil\n' + BODY + '\n```\n' })).toBe(true)
		expect(isFenceClosed({ text: BODY, lang: 'anvil', raw: '~~~anvil\n' + BODY + '\n~~~\n' })).toBe(true)
	})

	test('false while the fence is still streaming', () => {
		expect(isFenceClosed({ text: BODY, lang: 'anvil', raw: '```anvil\n' + BODY })).toBe(false)
		expect(isFenceClosed({ text: '@cho', lang: 'anvil', raw: '```anvil\n@cho' })).toBe(false)
	})

	test('assumes complete when raw is absent -- better than guessing false', () => {
		expect(isFenceClosed({ text: BODY, lang: 'anvil' })).toBe(true)
	})
})

describe('anvilMarked', () => {
	const ext = anvilMarked()
	const code = ext.renderer.code

	test('claims anvil fences and renders them', () => {
		const out = code.call(null, { text: BODY, lang: 'anvil', raw: '```anvil\n' + BODY + '\n```' })
		expect(typeof out).toBe('string')
		expect(out).toContain('anvil-doc')
		expect(out).toContain('data-anvil-id="x"')
	})

	test('returns false for every other language so marked falls through', () => {
		expect(code.call(null, { text: 'x', lang: 'ts' })).toBe(false)
		expect(code.call(null, { text: 'x' })).toBe(false)
		expect(code.call(null, { text: 'x', lang: 'anvilish' })).toBe(false)
	})

	test('a streaming fence renders provisional', () => {
		const out = code.call(null, { text: BODY, lang: 'anvil', raw: '```anvil\n' + BODY })
		expect(out).toContain('anvil-doc-streaming')
	})

	test('a custom lang can be claimed instead', () => {
		const alt = anvilMarked({ lang: 'ui' }).renderer.code
		expect(alt.call(null, { text: BODY, lang: 'ui', raw: '```ui\n' + BODY + '\n```' })).toContain('anvil-doc')
		expect(alt.call(null, { text: BODY, lang: 'anvil' })).toBe(false)
	})
})

describe('renderAnvilToken', () => {
	test('null for a non-anvil token, so it composes with an existing renderer', () => {
		expect(renderAnvilToken({ text: 'x', lang: 'ts' })).toBeNull()
	})

	test('html for an anvil token', () => {
		expect(renderAnvilToken({ text: BODY, lang: 'anvil' })).toContain('anvil-doc')
	})
})
