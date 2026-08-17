/**
 * @anvil-md/markdown-it -- render ```anvil fences through markdown-it.
 *
 * markdown-it exposes a `fence` rule whose token carries `info` (the language)
 * and `content` (the body). It does NOT carry the raw delimiters, so this
 * integration cannot detect a still-streaming fence on its own -- pass `closed`
 * if your host knows. See the README.
 */
import { renderAnvilFence } from '@anvil-md/render-html'

interface FenceToken {
	info?: string
	content?: string
}

/** The slice of markdown-it we touch. Structurally typed to avoid a dependency. */
interface MarkdownItLike {
	renderer: {
		rules: Record<string, unknown> & {
			fence?: (tokens: FenceToken[], idx: number, ...rest: unknown[]) => string
		}
	}
}

export interface AnvilMarkdownItOptions {
	/** Fence language to claim. Default `anvil`. */
	lang?: string
	/**
	 * Whether the fence has finished streaming. markdown-it discards the
	 * delimiters, so this cannot be inferred here. Default `true`.
	 */
	closed?: (token: FenceToken) => boolean
}

/**
 * ```ts
 * import MarkdownIt from 'markdown-it'
 * import { anvilMarkdownIt } from '@anvil-md/markdown-it'
 * import '@anvil-md/render-html/anvil.css'
 *
 * const md = new MarkdownIt().use(anvilMarkdownIt())
 * ```
 */
export function anvilMarkdownIt(opts: AnvilMarkdownItOptions = {}) {
	const want = opts.lang ?? 'anvil'
	const closed = opts.closed ?? (() => true)

	return (md: MarkdownItLike): void => {
		const fallback = md.renderer.rules.fence
		md.renderer.rules.fence = (tokens, idx, ...rest) => {
			const token = tokens[idx]
			// info can carry attributes after the language: ```anvil foo=bar
			const lang = (token?.info ?? '').trim().split(/\s+/)[0]
			if (lang === want) return renderAnvilFence(token?.content ?? '', closed(token ?? {}))
			if (!fallback) throw new Error('@anvil-md/markdown-it: no default fence renderer to fall back to')
			return fallback(tokens, idx, ...rest)
		}
	}
}
