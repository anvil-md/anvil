import { describe, expect, test } from 'bun:test'
import { remark } from 'remark'
import html from 'remark-html'
import { type AnvilRemarkOptions, anvilRemark } from './index'

// 0.5.0 shipped with every test below calling the plugin by hand, and the
// documented `.use(anvilRemark())` threw on the first real document. The host
// is the only judge of the plugin's shape, so it gets a test of its own.
describe('anvilRemark inside remark', () => {
	test('the README pipeline renders a fence', async () => {
		const md = '# Hi\n\n```anvil\n@choice id=db\n? Which database?\n- pg | Postgres\n```\n\n```ts\nconst a = 1\n```\n'
		const out = String(await remark().use(anvilRemark()).use(html, { sanitize: false }).process(md))
		expect(out).toContain('anvil-doc')
		expect(out).toContain('Postgres')
		expect(out).toContain('<code class="language-ts">')
	})

	test('options reach the renderer through .use()', async () => {
		const md = '```anvil\n@choice id=db\n? Which database?\n- pg | Postgres\n```\n'
		const out = String(await remark().use(anvilRemark({ closed: false })).use(html, { sanitize: false }).process(md))
		expect(out).toContain('anvil-doc-streaming')
	})
})

/** Attacher first, then transformer: the order unified calls them in. */
const run = (t: Parameters<ReturnType<ReturnType<typeof anvilRemark>>>[0], opts?: AnvilRemarkOptions) =>
	anvilRemark(opts)()(t)

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
		run(t)
		expect(t.children[1]?.type).toBe('html')
		expect(t.children[1]?.value).toContain('anvil-doc')
	})

	test('leaves every other code node alone', () => {
		const t = tree()
		run(t)
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
		run(t)
		expect(t.children[0]?.children?.[0]?.type).toBe('html')
	})

	test('closed:false marks the doc provisional', () => {
		const t = tree()
		run(t, { closed: false })
		expect(t.children[1]?.value).toContain('anvil-doc-streaming')
	})

	test('a host face reaches the renderer', () => {
		const t = { type: 'root', children: [{ type: 'code', lang: 'anvil', value: LEAD }] }
		run(t, { host })
		expect(t.children[0]?.value).toContain('data-face="lead"')
	})

	test('a childless tree is survivable', () => {
		expect(() => run({ type: 'root' })).not.toThrow()
	})
})
