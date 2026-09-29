/**
 * @anvil-md/marked -- render ```anvil fences through marked.
 *
 * marked is the easiest host to integrate correctly, because its `code` token
 * carries `raw`: the original source including the fence delimiters. That is
 * the only place the streaming state survives, so this is one of the few
 * integrations that can detect an unclosed fence on its own (see isFenceClosed).
 */
import { type AnvilHost, renderAnvilFence } from '@anvil-md/render-html'

/** The shape of marked's `code` token that we rely on. */
export interface CodeToken {
	text: string
	lang?: string
	raw?: string
}

export interface AnvilMarkedOptions {
	/** Fence language to claim. Default `anvil`. */
	lang?: string
	/**
	 * Decide whether the fence has finished streaming. Default: inspect
	 * `token.raw` for a closing delimiter.
	 *
	 * Override when your host knows better -- e.g. you are re-rendering a
	 * message that has already completed, in which case `() => true` avoids the
	 * regex entirely.
	 */
	closed?: (token: CodeToken) => boolean
	/**
	 * Faces a host registers for `@card type=` values (SPEC §4.12.5). Without
	 * it every card draws the stock body.
	 */
	host?: AnvilHost
}

/**
 * True when the raw token ends with a closing fence.
 *
 * marked will happily hand you a `code` token for a fence that is still being
 * streamed -- it treats end-of-input as an implicit close. The difference is
 * visible only in `raw`, which is why the check lives here and not in the
 * renderer.
 */
export function isFenceClosed(token: CodeToken): boolean {
	const raw = token.raw
	if (typeof raw !== 'string') return true
	return /\n[ \t]*(`{3,}|~{3,})[ \t]*\n?$/.test(raw)
}

/**
 * A marked extension. Register with `marked.use(anvilMarked())`.
 *
 * ```ts
 * import { Marked } from 'marked'
 * import { anvilMarked } from '@anvil-md/marked'
 * import '@anvil-md/render-html/anvil.css'
 *
 * const marked = new Marked()
 * marked.use(anvilMarked())
 * marked.parse(message)
 * ```
 */
export function anvilMarked(opts: AnvilMarkedOptions = {}) {
	const lang = opts.lang ?? 'anvil'
	const closed = opts.closed ?? isFenceClosed
	return {
		renderer: {
			code(this: unknown, token: CodeToken): string | false {
				if (token?.lang !== lang) return false
				return renderAnvilFence(token.text ?? '', closed(token), opts.host)
			},
		},
	}
}

/**
 * For hosts that already own their `renderer.code` and only want the branch.
 * Returns the HTML, or `null` when the token is not an ANVIL fence.
 */
export function renderAnvilToken(
	token: CodeToken,
	opts: AnvilMarkedOptions = {},
): string | null {
	const lang = opts.lang ?? 'anvil'
	if (token?.lang !== lang) return null
	return renderAnvilFence(token.text ?? '', (opts.closed ?? isFenceClosed)(token), opts.host)
}
