/**
 * The ANVIL syntax highlighter: a tokenizer, an HTML painter, and the overlay
 * that puts the paint behind the playground's textarea.
 *
 * TOTAL BY CONTRACT, same as the parser. This runs on every keystroke over
 * half-typed agent output, so it has no throw path and no unbounded backtrack.
 * Two invariants the tests pin down:
 *
 *   1. LOSSLESS -- concatenating the token texts reproduces the source exactly.
 *      That is what keeps the painted glyphs on the same pixels as the caret;
 *      a dropped space here is a visible drift halfway down the document.
 *   2. TOTAL -- never throws, for any input, including every prefix of every
 *      fixture (a fence arrives token by token).
 *
 * It is a highlighter, not a second parser: it recognises shapes, it never
 * decides what a block means. Where it knows something the parser does not
 * (~~~ literals, checkboxes) the divergence is called out at the line.
 */
import {
	ANVIL_BOXES,
	type AnvilTokenName,
	CELL_KEYS,
	END_KEYWORD,
	KIND_SET,
	ROW_SIGILS,
	SIGIL_BODY,
	TYPE_SET,
	tokenClass,
} from './anvil-tokens'

export interface AnvilTok {
	name: AnvilTokenName
	text: string
}

/** `key`, `key=bare`, `key="quoted"`. Lifted from parse.ts so the two agree. */
const ATTR = /([A-Za-z_][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
const HEADER = /^@(\w*)/
const BOX = /^\[(.)\]/
const LEADING_WS = /^[ \t]*/
/** A literal delimiter is any line whose first non-space run is three tildes. */
const FENCE = /^~~~/
/** `img=…` and friends: a trailing settings cell on an option row. */
const CELL_KV = new RegExp(`^(\\s*)(${CELL_KEYS.join('|')})(\\s*=\\s*)(.*)$`, 'i')

const BOX_BY_CHAR = new Map(ANVIL_BOXES.map((b) => [b.char, b.token]))

/**
 * Tokenize an ANVIL source string.
 *
 * Line-oriented with exactly one piece of state -- whether we are inside a
 * `~~~` literal -- because that is the only construct in the language that
 * spans lines (§4.4: no sigil parsing happens inside, and an unclosed literal
 * runs to the end of the fence).
 */
export function tokenizeAnvil(source: string): AnvilTok[] {
	const out: AnvilTok[] = []
	const push = (name: AnvilTokenName, text: string): void => {
		if (text) out.push({ name, text })
	}

	const lines = String(source ?? '').split('\n')
	let inLiteral = false

	for (let i = 0; i < lines.length; i++) {
		if (i > 0) push('text', '\n')
		const line = lines[i] ?? ''
		const indent = (LEADING_WS.exec(line) ?? [''])[0] ?? ''
		const body = line.slice(indent.length)

		// Inside a literal nothing is grammar. Only a closing delimiter is read,
		// and everything else -- sigils, headers, comments -- is inert text.
		if (inLiteral) {
			if (FENCE.test(body)) {
				push('literal', indent)
				push('fence', body.slice(0, 3))
				push('literal', body.slice(3))
				inLiteral = false
			} else {
				push('literal', line)
			}
			continue
		}

		push('text', indent)
		if (!body) continue

		if (FENCE.test(body)) {
			push('fence', body.slice(0, 3))
			push('text', body.slice(3))
			inLiteral = true
			continue
		}

		// parse.ts tests for a comment before anything else, so `#@choice` is a
		// comment and not a header. Whole line, dimmed, never rendered, never sent.
		if (body.startsWith('#')) {
			push('comment', body)
			continue
		}

		if (body.startsWith('@')) {
			header(body, push)
			continue
		}

		const sigil = body.charAt(0)
		if (ROW_SIGILS.has(sigil)) {
			row(sigil, body.slice(1), push)
			continue
		}

		const bodyToken = SIGIL_BODY[sigil]
		if (bodyToken) {
			push('sigil', sigil)
			push(bodyToken, body.slice(1))
			continue
		}

		// No sigil at all. parse.ts folds this into the prompt rather than
		// dropping it, so it is content, not an error.
		push('text', body)
	}

	return out
}

type Push = (name: AnvilTokenName, text: string) => void

/** `@kind key=value key="quoted value"`, or the `@end` terminator. */
function header(body: string, push: Push): void {
	const m = HEADER.exec(body)
	const word = m?.[1] ?? ''
	push('at', '@')

	const lower = word.toLowerCase()
	if (lower === END_KEYWORD) push('end', word)
	else push(KIND_SET.has(lower) ? 'kind' : 'kindUnknown', word)

	attrs(body.slice(1 + word.length), push)
}

function attrs(rest: string, push: Push): void {
	let last = 0
	ATTR.lastIndex = 0
	for (const m of rest.matchAll(ATTR)) {
		const key = m[1]
		const at = m.index
		if (!key || at === undefined) continue
		push('text', rest.slice(last, at))
		push('attrKey', key)

		const whole = m[0]
		if (whole.length > key.length) {
			push('attrEq', '=')
			const value = whole.slice(key.length + 1)
			const quoted = value.startsWith('"') || value.startsWith("'")
			push(quoted ? 'attrString' : 'attrValue', value)
		}
		last = at + whole.length
	}
	push('text', rest.slice(last))
}

/** A `-`, `_` or `%` row: sigil, optional markers, then pipe-separated cells. */
function row(sigil: string, afterSigil: string, push: Push): void {
	push('sigil', sigil)

	let rest = afterSigil
	const gap = (LEADING_WS.exec(rest) ?? [''])[0] ?? ''
	push('text', gap)
	rest = rest.slice(gap.length)

	if (sigil === '-') {
		const box = BOX.exec(rest)
		const boxToken = box ? BOX_BY_CHAR.get(box[1] ?? '') : undefined
		if (box && boxToken) {
			push(boxToken, box[0])
			rest = rest.slice(box[0].length)
			const after = (LEADING_WS.exec(rest) ?? [''])[0] ?? ''
			push('text', after)
			rest = rest.slice(after.length)
		}
		// `- !wipe | …` marks this single row destructive (§4.1).
		if (rest.startsWith('!')) {
			push('danger', '!')
			rest = rest.slice(1)
		}
	}

	cells(rest, sigil, push)
}

/**
 * Split on unescaped pipes and hand each cell to `cell`. Mirrors the splitter
 * in rows.ts, including `\|` for a literal pipe inside a label.
 */
function cells(rest: string, sigil: string, push: Push): void {
	let cur = ''
	let index = 0

	const flush = (): void => {
		cell(cur, index, sigil, push)
		cur = ''
		index++
	}

	for (let i = 0; i < rest.length; i++) {
		const ch = rest.charAt(i)
		if (ch === '\\' && rest.charAt(i + 1) === '|') {
			cur += '\\|'
			i++
			continue
		}
		if (ch === '|') {
			flush()
			push('pipe', '|')
			continue
		}
		cur += ch
	}
	flush()
}

/** One cell, with the escapes inside it lit separately. */
function cell(raw: string, index: number, sigil: string, push: Push): void {
	if (!raw) return

	// Cell 0 is the machine key: the option value, the field name, the dial name.
	if (index === 0) {
		const gap = (LEADING_WS.exec(raw) ?? [''])[0] ?? ''
		const rest = raw.slice(gap.length)
		push('text', gap)
		// A trailing `*` on a field name means required (§4.3).
		const star = sigil === '_' ? /^(.*?)(\*)(\s*)$/.exec(rest) : null
		if (star) {
			escaped('key', star[1] ?? '', push)
			push('required', '*')
			push('text', star[3] ?? '')
		} else {
			escaped('key', rest, push)
		}
		return
	}

	// Cell 1 of a field row is the type. Derived from FIELD_TYPES, so an
	// unknown type stays plain -- which is exactly what the parser warns about.
	if (index === 1 && sigil === '_' && TYPE_SET.has(raw.trim().toLowerCase())) {
		const gap = (LEADING_WS.exec(raw) ?? [''])[0] ?? ''
		const rest = raw.slice(gap.length)
		const tail = /\s*$/.exec(rest)?.[0] ?? ''
		push('text', gap)
		push('fieldType', rest.slice(0, rest.length - tail.length))
		push('text', tail)
		return
	}

	const kv = CELL_KV.exec(raw)
	if (kv) {
		push('text', kv[1] ?? '')
		push('cellKey', kv[2] ?? '')
		push('attrEq', kv[3] ?? '')
		escaped('attrValue', kv[4] ?? '', push)
		return
	}

	escaped('text', raw, push)
}

/** Emit `s` under `name`, lifting every `\|` out as its own escape token. */
function escaped(name: AnvilTokenName, s: string, push: Push): void {
	let last = 0
	for (let i = 0; i < s.length - 1; i++) {
		if (s.charAt(i) !== '\\' || s.charAt(i + 1) !== '|') continue
		push(name, s.slice(last, i))
		push('escape', '\\|')
		i++
		last = i + 1
	}
	push(name, s.slice(last))
}

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
}

/** This is user-typed text on its way into innerHTML. Never skip it. */
export function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

/** Tokenize and paint. The output is a run of spans, safe to set as innerHTML. */
export function highlightAnvil(source: string): string {
	let html = ''
	for (const t of tokenizeAnvil(source)) {
		const text = escapeHtml(t.text)
		html += t.name === 'text' ? text : `<span class="${tokenClass(t.name)}">${text}</span>`
	}
	return html
}

/**
 * A textarea does render a final empty line for a trailing newline; a <pre>
 * does not, and the two then disagree about how tall the document is. One
 * sentinel newline in the mirror fixes it. Extra trailing content in the ghost
 * is invisible -- it sits behind the textarea and scrolls with it -- so this is
 * appended unconditionally rather than only when the value ends in a newline.
 */
export function ghostHtml(source: string): string {
	return `${highlightAnvil(source)}\n`
}

export interface Highlighter {
	/** Repaint from the textarea's current value. For programmatic changes. */
	paint(): void
}

/**
 * Put the paint behind the textarea.
 *
 * The overlay is decoration: the <pre> is aria-hidden and the textarea keeps
 * its own label, so a screen reader gets one editable field and no shadow copy
 * of the same text.
 *
 * Metric parity is structural rather than copied -- both elements carry the
 * .pg-input class, so font, size, leading, padding, border width and
 * white-space cannot drift apart in a later edit to one of them.
 */
export function attachHighlighter(
	source: HTMLTextAreaElement,
	ghost: HTMLElement,
): Highlighter | null {
	const code = ghost.querySelector('code')
	if (!code) return null

	const paint = (): void => {
		code.innerHTML = ghostHtml(source.value)
		sync()
	}

	const sync = (): void => {
		ghost.scrollTop = source.scrollTop
		ghost.scrollLeft = source.scrollLeft
	}

	// Immediate, not debounced: the paint has to keep up with the caret. The
	// parse is what gets debounced, over in playground.ts.
	source.addEventListener('input', paint)
	source.addEventListener('scroll', sync, { passive: true })

	paint()
	return { paint }
}
