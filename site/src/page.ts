import { renderAnvilFence } from '@anvil-md/render-html'
import type { Page } from '@/types'

/**
 * Every ANVIL block on this page is rendered HERE, at build time, by the real
 * renderer in ../../packages/render-html -- imported from source via a Vite
 * alias in astro.config.ts.
 *
 * Nothing on this page is a screenshot or a hand-written mock. If the renderer
 * regresses, the site shows it. That is the point.
 */
const block = (src: string): string => renderAnvilFence(src.trim(), true)

/** The same source, shown as the author typed it and as it renders. */
const both = (src: string): string[] => [
	`<pre class="anvil-src"><code>${src
		.trim()
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')}</code></pre>`,
	block(src),
]

export const page: Page = {
	meta: {
		title: 'ANVIL -- ask inline, ask once',
		description:
			'A tiny DSL an LLM writes inside a fenced code block, which renders as real UI inline in the conversation. Every answer compiles back to structured text the model reads as an ordinary turn.',
	},

	theme: {
		preset: 'brutal',
	},

	brand: 'ANVIL',

	hero: {
		eyebrow: 'Agent-Native Visual Interaction Language',
		title: 'Ask inline. Ask once.',
		lead: 'An LLM writes four lines of markdown mid-sentence. It renders as real UI, right where the question was asked. The human clicks. The answer comes back as structured text and the block freezes forever.',
		ctas: [
			{
				label: 'Read the spec',
				href: 'https://github.com/anvil-md/anvil/blob/main/SPEC.md',
				variant: 'solid',
			},
			{ label: 'GitHub', href: 'https://github.com/anvil-md/anvil', variant: 'ghost' },
		],
	},

	sections: [
		{
			kind: 'prose',
			id: 'what',
			nav: 'What',
			title: 'Two halves, nothing in between',
			lead: 'Markdown going down. Structured text coming up. No tool call, no widget runtime, no event bus reaching into the agent loop.',
			body: [
				'The agent writes this, in the middle of an ordinary message:',
				...both(`@choice id=deploy-target
? Where should I ship this?
: Staging is wiped nightly, so nothing you do there is permanent.
- prod   | Production  | live traffic, no undo
- stage  | Staging     | safe, wiped nightly
- !scrap | Start over  | we bin the existing build
- hold   | Nowhere yet | keep it on the shelf`),
				'The human clicks one. It stamps. And the model receives a plain user turn:',
				`<pre class="anvil-src"><code>&lt;stamp block="deploy-target" kind="choice" value="stage" label="Staging"&gt;
I picked Staging.
&lt;/stamp&gt;</code></pre>`,
				'**That tag is the entire integration.** Attributes are the truth; the sentence is the courtesy, so the transcript still reads like a conversation months later and a model that ignores the tag still gets the gist.',
			],
		},

		{
			kind: 'prose',
			id: 'axiom',
			nav: 'Why',
			title: 'Why it freezes',
			lead: 'One axiom drives every rule in the spec.',
			body: [
				'> A conversation transcript is an append-only record of things that happened.<br>A widget that can be re-answered turns that record into a lie.',
				'So an ANVIL block is answered **once** and then frozen -- a *stamp*. There is no unstamp verb, in the language, in the API, or in the database. To change an answer the agent asks again, in a new block.',
				'And a stamped block still renders **in full**: the answer, and the options that were rejected. Those rejected rows are part of the record. They show what the human was choosing *between*, which is the thing you actually want to know when you read it back.',
				'It also means a block never has to be a modal. It sits in the message that asked the question, at the point in the conversation where the question made sense.',
			],
		},

		{
			kind: 'diagram',
			id: 'flow',
			title: 'The whole protocol',
			source: `flowchart LR
  A["Agent writes<br/>an anvil fence"] --> B["Host parses<br/>and renders"]
  B --> C["Human clicks"]
  C --> D["Server stamps<br/>blockId + nonce"]
  D --> E["stamp tag<br/>as a user turn"]
  E --> A
  D --> F["Block freezes<br/>in place"]`,
			caption:
				'The server holds the stamp, keyed by block id. The client cache is allowed to be wrong, and a second answer is refused rather than overwritten.',
		},

		{
			kind: 'prose',
			id: 'blocks',
			nav: 'Blocks',
			title: 'Ten blocks, closed on purpose',
			lead: 'Everything below renders live, on this page, from the real package.',
			body: [
				'Ask the aesthetic questions visually. Six swatches beat six adjectives, every time:',
				...both(`@gallery id=palette render=swatch select=one
? Which palette?
- ink  | Ink and paper | warm, printed | swatch=#111111,#f5f2ea,#c8452d
- deep | Deep water    | cold, gridded | swatch=#0b2540,#1d7a8c,#e8f1f2
- volt | Volt          | loud, black   | swatch=#0a0a0a,#e6ff00,#8a8a8a`),
				'Some answers are a dial, not a pick. "How formal" was never a multiple-choice question:',
				...both(`@scale id=tone steps=5
? Set the dials
% formal | Formal | Playful | 2
% dense  | Dense  | Airy    | 1
% quiet  | Quiet  | Loud    | 5`),
				'Typed fields, when you genuinely need words. Eight types, and `secret` is masked everywhere -- in the control, in the record, and in the tag that reaches the model:',
				...both(`@input id=company submit="That's us"
? Who are you?
_ legal*  | text   | Legal name      | Acme Ltd
_ site    | url    | Current website | https://...
_ token   | secret | API key
_ nda     | bool   | We need an NDA first`),
				'And prose, for the things that are not questions at all:',
				...both(`@note tone=warn
> Staging shares the production database.
> Migrations you run there are real.`),
			],
		},

		{
			kind: 'features',
			id: 'design',
			nav: 'Design',
			columns: 3,
			title: 'What the spec is careful about',
			lead: 'Most of these exist because someone got them wrong first.',
			items: [
				{
					title: 'The parser never throws',
					body: 'An LLM emits a fence token by token, so **every prefix of every fence** is a real input a renderer will see. A thrown parse error inside a page renderer takes down far more than one block. Malformed input degrades with a visible warning instead.',
				},
				{
					title: 'Inert while streaming',
					body: 'A block whose last option has not arrived yet renders visibly provisional and cannot be answered. Otherwise someone answers a question they have not finished reading.',
				},
				{
					title: 'Ids come from content',
					body: 'A block with no `id=` gets one hashed from its body -- never from its position, because streaming can reorder, and a positional id lands the answer on the wrong block.',
				},
				{
					title: 'Height cannot change',
					body: 'A block must occupy the same space stamped as it did open. One that shrinks three screens up yanks the scroll position out from under the reader.',
				},
				{
					title: 'Attributes are allowlisted',
					body: '`swatch`, `font` and `img` land in `style` and `src`, where escaping is not sufficient. Hex only, conservative family names, `http(s)` only. Anything else is dropped, not escaped.',
				},
				{
					title: 'Answers are untrusted',
					body: "A stamp is free text somebody typed, sitting right next to the agent's own markdown. It has to reach the model framed as data, not as instructions.",
				},
			],
		},

		{
			kind: 'steps',
			id: 'install',
			nav: 'Install',
			title: 'Wire it in',
			lead: 'Two packages. Zero dependencies in the one that matters.',
			items: [
				{
					title: 'Add the packages',
					body: '`bun add @anvil-md/parser @anvil-md/render-html`<br><br>The parser has no dependencies, no DOM and no framework. It runs anywhere JavaScript runs.',
				},
				{
					title: 'Hook your markdown renderer',
					body: "When you hit a fence with `lang === 'anvil'`, call `renderAnvilFence(body, fenceIsClosed)` instead of your normal code path. It returns an HTML string, so it drops into any pipeline -- React, Vue, Svelte, a static site, a server response.",
				},
				{
					title: 'Pass the streaming flag honestly',
					body: 'The second argument is false while the message is still arriving. Get this wrong and blocks become clickable mid-sentence.',
				},
				{
					title: 'Import the stylesheet, or do not',
					body: '`anvil.css` is self-contained and themeable through `--anvil-*` tokens. Or ignore it and style the class names yourself. The blocks on this page use the shipped stylesheet with about fifteen lines of token overrides.',
				},
			],
		},

		{
			kind: 'faq',
			id: 'faq',
			nav: 'FAQ',
			title: 'Reasonable objections',
			items: [
				{
					q: 'Why not just use a tool call?',
					a: 'A tool call costs a round trip and renders **somewhere else** -- a modal, a panel, a side channel. ANVIL costs four lines of markdown typed mid-sentence and renders exactly where the question was asked. Read the transcript back six months later and it still makes sense.',
				},
				{
					q: 'Is this a form library?',
					a: 'No, and the difference matters. A form collects fields; ANVIL is built for an interview. Ask, read, **react**, then ask again. An agent that emits eight blocks at once has built a form with extra steps. The interesting turn is the one where the agent notices your answers contradict each other and asks which one is true.',
				},
				{
					q: 'What happens if nobody clicks?',
					a: 'That is the common case, and the spec is explicit about it: design every block so "never answered" is survivable. The composer never goes away, so a human who ignores the block and types prose has answered it. `@void` is how the agent retracts a block the conversation moved past.',
				},
				{
					q: 'Can I add my own block type?',
					a: 'Please do not. The set is closed on purpose -- nearly everything you want is one of the ten with an attribute set. `@markdown` in particular would just be `@note` with different escaping, which is why `@note` renders markdown instead.',
				},
				{
					q: 'Is it finished?',
					a: 'No, and the README says exactly which parts. The parser and the HTML renderer are implemented and tested. **Stamping is specified and not built** -- doing it properly needs server-held state, idempotency and a permission model, none of which belong in a rendering package. Sections 6 and 7 of the spec are the contract if you want to build it.',
				},
			],
		},

		{
			kind: 'cta',
			id: 'start',
			title: 'The click is the signature',
			lead: 'MIT licensed. The spec is precise enough to implement against in any language.',
			ctas: [
				{
					label: 'Read SPEC.md',
					href: 'https://github.com/anvil-md/anvil/blob/main/SPEC.md',
					variant: 'solid',
				},
				{ label: 'anvil-md/anvil', href: 'https://github.com/anvil-md/anvil', variant: 'ghost' },
			],
		},
	],

	footer: {
		text: 'ANVIL is MIT licensed. Icon geometry is Lucide, ISC.',
		links: [
			{ label: 'GitHub', href: 'https://github.com/anvil-md/anvil' },
			{ label: 'Spec', href: 'https://github.com/anvil-md/anvil/blob/main/SPEC.md' },
			{
				label: '@anvil-md/parser',
				href: 'https://github.com/anvil-md/anvil/tree/main/packages/parser',
			},
		],
	},
}
