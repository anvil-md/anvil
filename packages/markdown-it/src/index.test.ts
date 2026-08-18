import { describe, expect, test } from 'bun:test'
import { anvilMarkdownIt } from './index'

const BODY = '@choice id=x\n? Q\n- a | A'

/** The slice of markdown-it the plugin touches. */
function fakeMd(fallback = (_t: unknown[], _i: number) => '<pre>default</pre>') {
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
		// Annotated, not inferred: a bare `{}` widens to a type with no `fence`
		// at all, so the assertion below stops typechecking. This is a host that
		// registered no fence renderer, which is the whole point of the test.
		const md: { renderer: { rules: { fence?: (t: unknown[], i: number) => string } } } = {
			renderer: { rules: {} },
		}
		anvilMarkdownIt()(md)
		expect(() => md.renderer.rules.fence?.([{ info: 'ts', content: 'x' }], 0)).toThrow(/fall back/)
	})
})
