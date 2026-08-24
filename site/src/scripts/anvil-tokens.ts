/**
 * The ANVIL highlighting vocabulary -- one list of token names, shared by the
 * playground's overlay tokenizer (highlight.ts) and the TextMate grammar the
 * site's Shiki instance uses for ```anvil fences (../grammars/anvil.tmlanguage.ts).
 *
 * One vocabulary, two consumers, so a colour decision is made once.
 *
 * The kind list is DERIVED from the parser's ANVIL_KINDS, never copied: the
 * language grows, and a highlighter that disagrees with the parser about what
 * `@card` means is worse than no highlighter. Same for FIELD_TYPES.
 *
 * The import is relative rather than `@anvil-md/parser` because astro.config.ts
 * loads the grammar builder before its own vite aliases exist. global.css pulls
 * the package stylesheet the same way, for the same reason.
 */
import { ANVIL_KINDS, FIELD_TYPES } from '../../../packages/parser/src/types'

/**
 * Every token the highlighter can emit. Concatenating the `text` of a token
 * stream reproduces the source byte for byte -- see the lossless test.
 */
export type AnvilTokenName =
	| 'text'
	| 'comment'
	| 'at'
	| 'kind'
	| 'kindUnknown'
	| 'end'
	| 'attrKey'
	| 'attrEq'
	| 'attrValue'
	| 'attrString'
	| 'sigil'
	| 'prompt'
	| 'subtext'
	| 'prose'
	| 'key'
	| 'required'
	| 'danger'
	| 'pipe'
	| 'escape'
	| 'cellKey'
	| 'fieldType'
	| 'boxTodo'
	| 'boxDoing'
	| 'boxDone'
	| 'boxBlocked'
	| 'fence'
	| 'literal'

/**
 * The palette is seven roles, not twenty-seven colours. The job of the
 * highlighter is to make the SHAPE of a block legible in a glance -- where the
 * header is, which lines are rows, what is inert -- so the grammar marks carry
 * the accent, the content sits at ink, and everything procedural recedes.
 *
 * `warn` `primary` `danger` are the semantic three, and appear only where they
 * mean what they say: a destructive option, a checkbox state.
 */
export type AnvilTokenRole = 'grammar' | 'ink' | 'soft' | 'faint' | 'primary' | 'warn' | 'danger'

export interface AnvilTokenStyle {
	/** TextMate scope, for the Shiki grammar and theme. */
	scope: string
	role: AnvilTokenRole
	bold?: boolean
	italic?: boolean
}

export const ANVIL_TOKENS: Record<AnvilTokenName, AnvilTokenStyle> = {
	text: { scope: 'source.anvil', role: 'soft' },
	comment: { scope: 'comment.line.number-sign.anvil', role: 'faint', italic: true },

	at: { scope: 'keyword.control.block.anvil', role: 'grammar', bold: true },
	kind: { scope: 'entity.name.tag.anvil', role: 'ink', bold: true },
	/* A word ANVIL_KINDS has not heard of. It differs from a known kind by
	   weight alone, on purpose: SPEC.md documents six blocks the reference
	   parser has not implemented yet, and flagging them red across half the
	   specification would say the documentation is broken when it is early. The
	   parse report is where the actual complaint belongs. */
	kindUnknown: { scope: 'entity.name.tag.unknown.anvil', role: 'soft' },
	end: { scope: 'keyword.control.end.anvil', role: 'grammar', bold: true },

	attrKey: { scope: 'entity.other.attribute-name.anvil', role: 'soft' },
	attrEq: { scope: 'punctuation.separator.key-value.anvil', role: 'faint' },
	attrValue: { scope: 'constant.other.attribute-value.anvil', role: 'ink' },
	attrString: { scope: 'string.quoted.anvil', role: 'ink' },

	sigil: { scope: 'punctuation.definition.sigil.anvil', role: 'grammar', bold: true },
	prompt: { scope: 'entity.name.section.prompt.anvil', role: 'ink', bold: true },
	// Not a `comment.*` scope, deliberately: the site's theme italicises
	// everything under `comment`, and subtext is content, not an aside.
	subtext: { scope: 'markup.other.subtext.anvil', role: 'soft' },
	prose: { scope: 'markup.other.prose.anvil', role: 'soft' },

	key: { scope: 'variable.other.key.anvil', role: 'ink' },
	required: { scope: 'keyword.operator.required.anvil', role: 'grammar' },
	danger: { scope: 'invalid.deprecated.danger.anvil', role: 'danger', bold: true },

	pipe: { scope: 'punctuation.separator.cell.anvil', role: 'faint' },
	escape: { scope: 'constant.character.escape.anvil', role: 'grammar' },
	cellKey: { scope: 'entity.other.attribute-name.cell.anvil', role: 'soft' },
	fieldType: { scope: 'support.type.field.anvil', role: 'soft' },

	boxTodo: { scope: 'markup.checkbox.todo.anvil', role: 'faint' },
	boxDoing: { scope: 'markup.checkbox.doing.anvil', role: 'warn' },
	boxDone: { scope: 'markup.checkbox.done.anvil', role: 'primary' },
	boxBlocked: { scope: 'markup.checkbox.blocked.anvil', role: 'danger' },

	fence: { scope: 'punctuation.definition.literal.anvil', role: 'grammar', bold: true },
	literal: { scope: 'string.unquoted.literal.anvil', role: 'soft' },
}

/** The CSS class the overlay puts on a span. `av-` so nothing else collides. */
export function tokenClass(name: AnvilTokenName): string {
	return `av-${name}`
}

/** Checkbox states, in the order the grammar must try them. */
export const ANVIL_BOXES: ReadonlyArray<{ char: string; token: AnvilTokenName }> = [
	{ char: ' ', token: 'boxTodo' },
	{ char: 'x', token: 'boxDone' },
	{ char: 'X', token: 'boxDone' },
	{ char: '~', token: 'boxDoing' },
	{ char: '!', token: 'boxBlocked' },
]

/**
 * Line sigils, keyed by the character at the head of a trimmed line.
 *
 * `? : - _ % >` are what parse.ts dispatches on today. `+` and `=` are in the
 * spec (§3.1, the `@example` prefill) but have no handler yet, so the parser
 * folds them into the prompt -- they are tokenized here because a highlighter
 * that goes blank the day a sigil lands is a highlighter nobody trusts.
 */
export const SIGIL_BODY: Record<string, AnvilTokenName> = {
	'?': 'prompt',
	':': 'subtext',
	'>': 'prose',
	'+': 'text',
	'=': 'text',
}

/** Rows whose first cell is a machine key rather than prose. */
export const ROW_SIGILS = new Set(['-', '_', '%'])

/**
 * Cell-position `key=` settings on a row. Mirrors rows.ts CELL_KV, plus
 * `shape`, which is the same idea on a @flow node row rather than an option.
 */
export const CELL_KEYS: readonly string[] = ['img', 'swatch', 'font', 'sample', 'shape']

export const KINDS: readonly string[] = ANVIL_KINDS
export const TYPES: readonly string[] = FIELD_TYPES
export const KIND_SET: ReadonlySet<string> = new Set<string>(ANVIL_KINDS)
export const TYPE_SET: ReadonlySet<string> = new Set<string>(FIELD_TYPES)

/** The container terminator. Not a kind -- it closes one. */
export const END_KEYWORD = 'end'
