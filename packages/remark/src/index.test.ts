import { describe, expect, test } from 'bun:test'
import { anvilRemark } from './index'

const BODY = '@choice id=x\n? Q\n- a | A'
const LEAD = '@card id=l type=lead\n? @demo.bakery\n+ score 82'
const host = { faces: { lead: () => '<i>score 82</i>' } }
const tree = () => ({
	type: 'root',
	children: [
		{ type: 'paragraph', children: [{ type: 'text', value: 'hi' }] },
		{ type: 'code', lang: 'anvil', value: BODY },
		{ type: 'code', lang: 'ts', value: 'const a = 1' },
	],
})

describe('anvilRemark', () => {
	test('replaces an anvil code node with a raw html node', () => {
		const t = tree()
		anvilRemark()(t)
		expect(t.children[1]?.type).toBe('html')
		expect(t.children[1]?.value).toContain('anvil-doc')
	})

	test('leaves every other code node alone', () => {
		const t = tree()
		anvilRemark()(t)
		expect(t.children[2]?.type).toBe('code')
		expect(t.children[2]?.value).toBe('const a = 1')
	})

	test('descends into nested containers', () => {
		const t = {
			type: 'root',
			children: [
				{ type: 'blockquote', children: [{ type: 'code', lang: 'anvil', value: BODY }] },
			],
		}
		anvilRemark()(t)
		expect(t.children[0]?.children?.[0]?.type).toBe('html')
	})

	test('closed:false marks the doc provisional', () => {
		const t = tree()
		anvilRemark({ closed: false })(t)
		expect(t.children[1]?.value).toContain('anvil-doc-streaming')
	})

	test('a host face reaches the renderer', () => {
		const t = { type: 'root', children: [{ type: 'code', lang: 'anvil', value: LEAD }] }
		anvilRemark({ host })(t)
		expect(t.children[0]?.value).toContain('data-face="lead"')
	})

	test('a childless tree is survivable', () => {
		expect(() => anvilRemark()({ type: 'root' })).not.toThrow()
	})
})
