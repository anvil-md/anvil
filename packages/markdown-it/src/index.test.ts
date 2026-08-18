import { describe, expect, test } from 'bun:test'
import { anvilMarkdownIt } from './index'

const BODY = '@choice id=x\n? Q\n- a | A'

type FenceRule = (tokens: unknown[], idx: number) => string

/**
 * The slice of markdown-it the plugin touches.
 *
 * `fence` is declared OPTIONAL rather than inferred, because the plugin's whole
 * job is to install it. Inferring the shape from an object literal typed the
 * no-fallback case as `rules: {}`, which had no `fence` property at all and
 * failed the typecheck at the one call site that matters.
 */
interface FakeMd {
	renderer: { rules: { fence?: FenceRule } }
}

function fakeMd(fallback: FenceRule = () => '<pre>default</pre>'): FakeMd {
	return { renderer: { rules: { fence: fallback } } }
}

describe('anvilMarkdownIt', () => {
	test('renders an anvil fence', () => {
		const md = fakeMd()
		anvilMarkdownIt()(md)
		const out = md.renderer.rules.fence?.([{ info: 'anvil', content: BODY }], 0)
		expect(out).toContain('anvil-doc')
		expect(out).toContain('data-anvil-id="x"')
	})

	test('delegates every other fence to the previous renderer', () => {
		const md = fakeMd()
		anvilMarkdownIt()(md)
		expect(md.renderer.rules.fence?.([{ info: 'ts', content: 'x' }], 0)).toBe('<pre>default</pre>')
	})

	test('info may carry attributes after the language', () => {
		const md = fakeMd()
		anvilMarkdownIt()(md)
		expect(md.renderer.rules.fence?.([{ info: 'anvil foo=bar', content: BODY }], 0)).toContain('anvil-doc')
	})

	test('assumes complete, and honours an explicit closed()', () => {
		const md = fakeMd()
		anvilMarkdownIt({ closed: () => false })(md)
		expect(md.renderer.rules.fence?.([{ info: 'anvil', content: BODY }], 0)).toContain('anvil-doc-streaming')
	})

	test('a missing fallback is a loud error, not a silent empty render', () => {
		const md: FakeMd = { renderer: { rules: {} } }
		anvilMarkdownIt()(md)
		expect(() => md.renderer.rules.fence?.([{ info: 'ts', content: 'x' }], 0)).toThrow(/fall back/)
	})
})
