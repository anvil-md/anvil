/**
 * @anvil-md/react -- an ANVIL block as a React component.
 *
 * ON dangerouslySetInnerHTML: yes, deliberately, and it is safe here for a
 * specific reason rather than by hope. @anvil-md/render-html emits a string it
 * builds itself; it never interpolates agent text into markup unescaped. Prompts,
 * labels, hints and placeholders are HTML-escaped, and the three values that land
 * in attribute position (`swatch`, `font`, `img`) are ALLOWLISTED -- hex only,
 * conservative family names, http(s) only -- because escaping is not sufficient
 * in a style or src attribute. A value that fails the allowlist is dropped.
 * That behaviour is covered by tests in the renderer package.
 *
 * What this does NOT do is sanitise arbitrary HTML, because it never receives
 * any: the input is ANVIL source, not markup.
 */
import { renderAnvilFence } from '@anvil-md/render-html'
import { type ReactElement, useMemo } from 'react'

export interface AnvilProps {
	/** The body of the fence, without the ``` delimiters. */
	source: string
	/**
	 * False while the message is still streaming. A block whose last option has
	 * not arrived must never look answerable, so this defaults to `true` only
	 * because most callers render completed messages -- pass it honestly.
	 */
	closed?: boolean
	className?: string
}

/**
 * ```tsx
 * import { Anvil } from '@anvil-md/react'
 * import '@anvil-md/render-html/anvil.css'
 *
 * <Anvil source={fenceBody} closed={!isStreaming} />
 * ```
 */
export function Anvil({ source, closed = true, className }: AnvilProps): ReactElement {
	const html = useMemo(() => renderAnvilFence(source, closed), [source, closed])
	// biome-ignore lint/security/noDangerouslySetInnerHtml: the renderer builds
	// this string itself and escapes/allowlists every agent-authored value; see
	// the module header.
	return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * A drop-in `code` component for react-markdown.
 *
 * ```tsx
 * <ReactMarkdown components={{ code: anvilCode() }}>{message}</ReactMarkdown>
 * ```
 *
 * CAVEAT, and it is a real one: by the time react-markdown hands you a node,
 * the fence delimiters are gone, so this cannot tell a finished fence from a
 * streaming one. Pass `closed` yourself from whatever your app knows about the
 * message. See the package README.
 */
export function anvilCode(opts: { lang?: string; closed?: boolean } = {}) {
	const want = opts.lang ?? 'anvil'
	return function Code({
		className,
		children,
		...rest
	}: {
		className?: string
		children?: unknown
	}): ReactElement {
		const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
		if (lang !== want) {
			return (
				<code className={className} {...rest}>
					{children as ReactElement}
				</code>
			)
		}
		return <Anvil source={String(children ?? '')} closed={opts.closed ?? true} />
	}
}
