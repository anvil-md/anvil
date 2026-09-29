import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Anvil, anvilCode } from './index'

const BODY = '@choice id=x\n? Q\n- a | A'
const LEAD = '@card id=l type=lead\n? @demo.bakery\n+ score 82'
const host = { faces: { lead: () => '<i>score 82</i>' } }

describe('<Anvil>', () => {
	test('renders the block markup', () => {
		const html = renderToStaticMarkup(<Anvil source={BODY} />)
		expect(html).toContain('anvil-doc')
		expect(html).toContain('data-anvil-id="x"')
	})

	test('closed=false marks it provisional', () => {
		expect(renderToStaticMarkup(<Anvil source={BODY} closed={false} />)).toContain('anvil-doc-streaming')
	})

	test('className lands on the wrapper', () => {
		expect(renderToStaticMarkup(<Anvil source={BODY} className="mine" />)).toContain('class="mine"')
	})

	test('escaping survives the React boundary', () => {
		const html = renderToStaticMarkup(<Anvil source={'@choice id=x\n? <img src=q onerror=go>\n- a | A'} />)
		expect(html).not.toContain('<img src=q')
		expect(html).toContain('&lt;img')
	})
})

describe('anvilCode', () => {
	const Code = anvilCode()

	test('claims language-anvil', () => {
		expect(renderToStaticMarkup(<Code className="language-anvil">{BODY}</Code>)).toContain('anvil-doc')
	})

	test('passes every other language through as a code element', () => {
		const html = renderToStaticMarkup(<Code className="language-ts">const a = 1</Code>)
		expect(html).toContain('<code')
		expect(html).not.toContain('anvil-doc')
	})

	test('a host face reaches the renderer, from the component and from the code slot', () => {
		expect(renderToStaticMarkup(<Anvil source={LEAD} host={host} />)).toContain('data-face="lead"')
		const Faced = anvilCode({ host })
		expect(renderToStaticMarkup(<Faced className="language-anvil">{LEAD}</Faced>)).toContain('data-face="lead"')
	})

	test('an unlabelled code node is left alone', () => {
		expect(renderToStaticMarkup(<Code>plain</Code>)).not.toContain('anvil-doc')
	})
})
