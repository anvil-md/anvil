/**
 * The TextMate grammar for ```anvil fences, handed to Shiki in astro.config.ts.
 *
 * It is BUILT, not hand-written JSON, for one reason: the block-kind
 * alternation is generated from the parser's ANVIL_KINDS and the field-type
 * alternation from FIELD_TYPES. A checked-in .tmLanguage.json goes stale the
 * afternoon the language gains a kind, and a highlighter that disagrees with
 * the parser is worse than none.
 *
 * Token scopes come from scripts/anvil-tokens.ts, the same list the
 * playground's overlay tokenizer paints with, so the spec listings and the
 * playground agree about what a token is.
 *
 * The one rule the whole grammar hangs off: `#literal` is matched FIRST and
 * carries no inner patterns, so nothing between a pair of `~~~` is grammar
 * (§4.4). Everything else is a line rule.
 */
import {
	ANVIL_BOXES,
	ANVIL_TOKENS,
	type AnvilTokenName,
	CELL_KEYS,
	END_KEYWORD,
	KINDS,
	TYPES,
} from '../scripts/anvil-tokens'

/**
 * The slice of the TextMate schema this grammar uses. Declared here rather
 * than imported from shiki so the rules below are contextually typed: without
 * it, TypeScript infers a union of capture-map shapes and every rule with a
 * different number of groups stops being assignable to the next.
 */
interface TmRule {
	name?: string
	include?: string
	match?: string
	begin?: string
	end?: string
	contentName?: string
	captures?: Record<string, { name: string }>
	beginCaptures?: Record<string, { name: string }>
	endCaptures?: Record<string, { name: string }>
	patterns?: TmRule[]
}

interface TmGrammar {
	name: string
	scopeName: string
	patterns: TmRule[]
	repository: Record<string, TmRule>
}

const s = (name: AnvilTokenName): string => ANVIL_TOKENS[name].scope
const cap = (name: AnvilTokenName): { name: string } => ({ name: s(name) })

/** Case-insensitive alternation. openBlock lowercases before it compares. */
const anyOf = (words: readonly string[]): string => `(?i:${words.join('|')})`

/** Literal inside a character class. None of the states need it today; cheap insurance. */
const inClass = (c: string): string => (/[\]\\^-]/.test(c) ? `\\${c}` : c)

/** Checkbox states, grouped by the colour they get: `x` and `X` are one state. */
const BOX_GROUPS = ANVIL_BOXES.reduce<Map<AnvilTokenName, string[]>>((acc, b) => {
	const chars = acc.get(b.token) ?? []
	chars.push(b.char)
	acc.set(b.token, chars)
	return acc
}, new Map())

/** A `-` row opening with a checkbox. One rule per state, since a TextMate
 *  capture cannot pick its scope from what it matched. */
const boxRules: TmRule[] = [...BOX_GROUPS].map(([token, chars]) => ({
	begin: `^\\s*(-)[ \\t]*(\\[[${chars.map(inClass).join('')}]\\])[ \\t]*`,
	beginCaptures: { 1: cap('sigil'), 2: cap(token) },
	end: '$',
	patterns: [{ include: '#firstCell' }, { include: '#cells' }],
}))

export const anvilGrammar: TmGrammar = {
	name: 'anvil',
	scopeName: 'source.anvil',
	patterns: [
		{ include: '#literal' },
		{ include: '#comment' },
		{ include: '#end' },
		{ include: '#header' },
		{ include: '#option' },
		{ include: '#field' },
		{ include: '#dial' },
		{ include: '#prompt' },
		{ include: '#subtext' },
		{ include: '#prose' },
		{ include: '#plainSigil' },
	],

	repository: {
		/* §4.4: the only construct that spans lines, and the only one that turns
		   the grammar off. No inner patterns, deliberately -- a sigil in here is
		   text. An unclosed literal runs to the end of the fence. */
		literal: {
			name: 'meta.literal.anvil',
			begin: '^\\s*(~~~)',
			beginCaptures: { 1: cap('fence') },
			end: '^\\s*(~~~)',
			endCaptures: { 1: cap('fence') },
			contentName: s('literal'),
		},

		/* Tested before the header, exactly as parse.ts orders it: `#@choice` is
		   a comment, not a block. */
		comment: { match: '^\\s*#.*$', name: s('comment') },

		/* A container terminator, not a kind. */
		end: {
			match: `^\\s*(@)(${anyOf([END_KEYWORD])})\\b(.*)$`,
			captures: { 1: cap('at'), 2: cap('end') },
		},

		header: {
			patterns: [
				{
					begin: `^\\s*(@)(${anyOf(KINDS)})\\b`,
					beginCaptures: { 1: cap('at'), 2: cap('kind') },
					end: '$',
					patterns: [{ include: '#attrs' }],
				},
				/* A word ANVIL_KINDS has never heard of. The parser turns this into
				   a warn note; here it just recedes. */
				{
					begin: '^\\s*(@)(\\w*)',
					beginCaptures: { 1: cap('at'), 2: cap('kindUnknown') },
					end: '$',
					patterns: [{ include: '#attrs' }],
				},
			],
		},

		attrs: {
			patterns: [
				{
					match: '([A-Za-z_][\\w-]*)(=)("[^"]*"|\'[^\']*\')',
					captures: { 1: cap('attrKey'), 2: cap('attrEq'), 3: cap('attrString') },
				},
				{
					match: '([A-Za-z_][\\w-]*)(=)(\\S+)',
					captures: { 1: cap('attrKey'), 2: cap('attrEq'), 3: cap('attrValue') },
				},
				/* A bare attribute means true. */
				{ match: '[A-Za-z_][\\w-]*', name: s('attrKey') },
			],
		},

		option: {
			patterns: [
				...boxRules,
				{
					/* `- !wipe | …` marks this single row destructive (§4.1). */
					begin: '^\\s*(-)[ \\t]*(!)?[ \\t]*',
					beginCaptures: { 1: cap('sigil'), 2: cap('danger') },
					end: '$',
					patterns: [{ include: '#firstCell' }, { include: '#cells' }],
				},
			],
		},

		field: {
			begin: '^\\s*(_)[ \\t]*',
			beginCaptures: { 1: cap('sigil') },
			end: '$',
			patterns: [
				/* `\G` anchors this to the head of the row, so only the first cell is
				   the field name. A trailing `*` means required (§4.3). */
				{
					match: '\\G([^|\\n*]+)(\\*)?',
					captures: { 1: cap('key'), 2: cap('required') },
				},
				{
					match: `(\\|)([ \\t]*)(${anyOf(TYPES)})(?=[ \\t]*(\\||$))`,
					captures: { 1: cap('pipe'), 3: cap('fieldType') },
				},
				{ include: '#cells' },
			],
		},

		dial: {
			begin: '^\\s*(%)[ \\t]*',
			beginCaptures: { 1: cap('sigil') },
			end: '$',
			patterns: [{ include: '#firstCell' }, { include: '#cells' }],
		},

		/* The machine key: the option value, the dial name. */
		firstCell: { match: '\\G[^|\\n]+', name: s('key') },

		cells: {
			patterns: [
				/* A literal pipe inside a label. Leftmost match, so it beats the
				   separator rule below by one character. */
				{ match: '\\\\\\|', name: s('escape') },
				{
					match: `(\\|)([ \\t]*)(${anyOf(CELL_KEYS)})(\\s*=\\s*)`,
					captures: { 1: cap('pipe'), 3: cap('cellKey'), 4: cap('attrEq') },
				},
				{ match: '\\|', name: s('pipe') },
			],
		},

		prompt: {
			match: '^\\s*(\\?)(.*)$',
			captures: { 1: cap('sigil'), 2: cap('prompt') },
		},
		subtext: {
			match: '^\\s*(:)(.*)$',
			captures: { 1: cap('sigil'), 2: cap('subtext') },
		},
		prose: {
			match: '^\\s*(>)(.*)$',
			captures: { 1: cap('sigil'), 2: cap('prose') },
		},
		/* `+` chip strip and `=` prefill. In the spec (§3.1), no handler in
		   parse.ts yet, so today they fold into the prompt. Lit anyway: a
		   highlighter that goes blank the day a sigil lands is one nobody trusts. */
		plainSigil: { match: '^\\s*([+=])', captures: { 1: cap('sigil') } },
	},
}

export default anvilGrammar
