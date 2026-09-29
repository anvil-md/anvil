/**
 * @anvil-md/remark -- a remark plugin that turns ```anvil fences into HTML.
 *
 * This is the highest-leverage integration: remark is the parser under
 * react-markdown, MDX, Astro, Docusaurus and most of the unified ecosystem, so
 * one plugin covers all of them.
 *
 * It is also the one with the sharpest caveats, and they are stated in the
 * README rather than papered over:
 *
 *  1. It emits a raw `html` mdast node. Pipelines that strip raw HTML (the
 *     unified default in some configurations) will drop it. With
 *     remark-rehype you need `allowDangerousHtml: true` plus `rehype-raw`.
 *  2. By the time remark has produced an mdast, the fence delimiters are gone,
 *     so streaming state cannot be recovered here. Pass `closed` from whatever
 *     your host knows about the message.
 *
 * EXPERIMENTAL: exercised against remark-html only. If you wire it into a
 * different pipeline and it misbehaves, that is a real bug, not misuse.
 */
import { type AnvilHost, renderAnvilFence } from '@anvil-md/render-html'

interface Node {
	type: string
	lang?: string | null
	value?: string
	children?: Node[]
}

export interface AnvilRemarkOptions {
	/** Fence language to claim. Default `anvil`. */
	lang?: string
	/** Whether fences are complete. Not inferable at this layer. Default true. */
	closed?: boolean
	/**
	 * Faces a host registers for `@card type=` values (SPEC §4.12.5). Without
	 * it every card draws the stock body.
	 */
	host?: AnvilHost
}

/**
 * ```ts
 * import { remark } from 'remark'
 * import html from 'remark-html'
 * import { anvilRemark } from '@anvil-md/remark'
 *
 * const out = await remark()
 *   .use(anvilRemark())
 *   .use(html, { sanitize: false })
 *   .process(message)
 * ```
 */
export function anvilRemark(opts: AnvilRemarkOptions = {}) {
	const want = opts.lang ?? 'anvil'
	const closed = opts.closed ?? true

	const walk = (node: Node): void => {
		const kids = node.children
		if (!Array.isArray(kids)) return
		for (let i = 0; i < kids.length; i++) {
			const child = kids[i]
			if (!child) continue
			if (child.type === 'code' && child.lang === want) {
				kids[i] = { type: 'html', value: renderAnvilFence(child.value ?? '', closed, opts.host) }
				continue
			}
			walk(child)
		}
	}

	return (tree: Node): void => walk(tree)
}
