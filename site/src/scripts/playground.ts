/**
 * The playground, client side.
 *
 * Both packages are dependency-free and DOM-free, so this whole page is one
 * textarea, one parse and one string of HTML. No network, no server, no
 * framework - the same two calls a host makes inside its markdown renderer,
 * made in a browser tab instead.
 *
 * The preset sources live here rather than in the page so the server-rendered
 * first paint and the client both read the same strings.
 */
import { type AnvilDoc, parseAnvil } from '@anvil-md/parser'
import { renderAnvilFence } from '@anvil-md/render-html'
import { attachHighlighter } from './highlight'

/** The parser is microseconds; this exists to stop the layout thrashing. */
const DEBOUNCE_MS = 100

export interface Preset {
	id: string
	/** Button face. The block kind, because that is what people are shopping for. */
	label: string
	source: string
}

/** Loaded in the textarea. Three kinds, so the page is alive before a click. */
export const DEFAULT_SOURCE = `# Everything here is parsed and rendered in this tab, by the same two
# packages that render the rest of this site. Lines opening with a hash
# are comments and never reach the document.

@note tone=info
> An agent writes one of these inside a fenced anvil block, mid-sentence.
> Edit the source on the left. The right-hand pane redraws as you type.

@choice id=deploy-target
? Where should I ship this?
: Staging is wiped nightly. Nothing there is permanent.
- prod   | Production  | live traffic, no undo
- stage  | Staging     | safe, wiped nightly
- !scrap | Start over  | we bin the existing build
- hold   | Nowhere yet | keep it on the shelf

@scale id=tone steps=5
? Set the dials
% formal | Formal | Playful | 2
% dense  | Dense  | Airy    | 1
% quiet  | Quiet  | Loud    | 5`

const CHOICE = `@choice id=migration select=one
? Run the migration when?
: It takes about four minutes and locks the orders table.
- now    | Right now        | I am watching the logs
- night  | Tonight, 03:00   | nobody is on the box
- !force | Now, no backup   | faster, and unrecoverable
- never  | Leave it as-is   | we ship without it`

const GALLERY = `@gallery id=palette render=swatch select=one
? Which palette?
: Six swatches beat six adjectives, every time.
- ink  | Ink and paper | warm, printed | swatch=#111111,#f5f2ea,#c8452d
- deep | Deep water    | cold, gridded | swatch=#0b2540,#1d7a8c,#e8f1f2
- volt | Volt          | loud, black   | swatch=#0a0a0a,#e6ff00,#8a8a8a
- moss | Moss          | quiet, matte  | swatch=#1f2a1c,#7f9971,#e7e3d6`

const SCALE = `@scale id=voice steps=7
? How should the copy read?
: Seven notches. The middle one is the default when you omit the number.
% formal | Formal   | Playful  | 3
% terse  | Terse    | Detailed | 5
% warm   | Clinical | Warm     | 6`

const INPUT = `@input id=company submit="That's us"
? Who are you?
: Anything marked with a star is required before the block will submit.
_ legal*  | text     | Legal name      | Acme Ltd
_ site    | url      | Current website | https://...
_ seats   | number   | How many seats  | 25
_ token   | secret   | API key
_ brief   | longtext | Anything else we should know
_ nda     | bool     | We need an NDA first`

const NOTE = `@note tone=warn
> Staging shares the production database.
> Migrations you run there are real, and there is no snapshot.

@note tone=danger
> This one is the loudest tone in the language. Spend it carefully.

@note tone=info
> And this is the quiet one, for the things that are not questions at all.`

/**
 * The whole point of the page. Every line below is wrong in a different way and
 * the parser still returns a document: it is TOTAL by contract, because an LLM
 * emits a fence token by token and a throw here white-screens the transcript.
 */
const BROKEN = `# Deliberately broken. Nothing here throws - each mistake
# degrades to a warning, and the block still renders.

@choice id=broken steps=99
? Which environment?
-       | Production | the value before the first pipe is missing
- stage | Staging
_       | text | a field row with no name either
% | Left | Right

@chioce id=nope
? a block kind that does not exist at all

@input id=typed
_ email | emial | a field type nobody has heard of`

export const PRESETS: Preset[] = [
	{ id: 'choice', label: '@choice', source: CHOICE },
	{ id: 'gallery', label: '@gallery render=swatch', source: GALLERY },
	{ id: 'scale', label: '@scale', source: SCALE },
	{ id: 'input', label: '@input', source: INPUT },
	{ id: 'note', label: '@note tone=warn', source: NOTE },
	{ id: 'broken', label: 'malformed', source: BROKEN },
]

export function warningCount(doc: AnvilDoc): number {
	return doc.blocks.reduce((n, b) => n + b.warnings.length, 0)
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** The status strip above the report. Shared with the server-rendered first paint. */
export function summarise(doc: AnvilDoc, closed: boolean): string {
	return [
		plural(doc.blocks.length, 'block'),
		plural(warningCount(doc), 'warning'),
		closed ? 'fence closed' : 'fence still streaming',
	].join('  ·  ')
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	cls?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag)
	if (cls) node.className = cls
	if (text !== undefined) node.textContent = text
	return node
}

/** Markup here must stay in step with the static table in playground.astro. */
function reportTable(doc: AnvilDoc): HTMLElement {
	if (!doc.blocks.length) {
		return el('p', 'pg-empty', 'Nothing parsed yet. The document is empty.')
	}

	const table = el('table', 'doc-table')
	const head = table.createTHead().insertRow()
	for (const label of ['Block', 'Kind', 'Diagnostics']) {
		head.appendChild(el('th', undefined, label))
	}

	const body = table.createTBody()
	for (const block of doc.blocks) {
		const row = body.insertRow()

		const idCell = el('td', 'pg-id')
		idCell.append(block.id)
		if (block.derivedId) idCell.appendChild(el('span', 'pg-derived', 'derived'))
		row.appendChild(idCell)

		row.appendChild(el('td', 'pg-kind', `@${block.kind}`))

		const diag = el('td')
		if (block.warnings.length) {
			const list = el('ul', 'pg-warns')
			for (const w of block.warnings) list.appendChild(el('li', 'pg-warn', w))
			diag.appendChild(list)
		} else {
			diag.appendChild(el('span', 'pg-ok', 'accepted, no warnings'))
		}
		row.appendChild(diag)
	}

	return table
}

export function mount(): void {
	const source = document.querySelector<HTMLTextAreaElement>('#pg-source')
	const output = document.querySelector<HTMLElement>('#pg-output')
	const report = document.querySelector<HTMLElement>('#pg-report')
	const status = document.querySelector<HTMLElement>('#pg-status')
	const streaming = document.querySelector<HTMLInputElement>('#pg-streaming')
	if (!source || !output || !report || !status || !streaming) return

	const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-preset]'))

	// The highlighter repaints on `input` itself, undebounced, so the paint keeps
	// up with the caret. `paint` here is only for the programmatic value changes
	// below, which fire no input event.
	const ghost = document.querySelector<HTMLElement>('#pg-ghost')
	const highlighter = ghost ? attachHighlighter(source, ghost) : null

	const draw = (): void => {
		const text = source.value
		const closed = !streaming.checked
		highlighter?.paint()

		// Exactly the call a host makes from its markdown renderer. `closed` is
		// false while the fence is still arriving, which renders the block
		// provisional and inert instead of answerable.
		output.innerHTML = renderAnvilFence(text, closed)

		const doc = parseAnvil(text, { partial: !closed })
		status.textContent = summarise(doc, closed)
		report.replaceChildren(reportTable(doc))

		const active = PRESETS.find((p) => p.source === text)?.id ?? ''
		for (const b of buttons) {
			b.setAttribute('aria-pressed', String(b.dataset.preset === active))
		}
	}

	let timer = 0
	source.addEventListener('input', () => {
		window.clearTimeout(timer)
		timer = window.setTimeout(draw, DEBOUNCE_MS)
	})

	// A toggle or a preset is a deliberate act, so it redraws immediately.
	streaming.addEventListener('change', draw)
	for (const b of buttons) {
		b.addEventListener('click', () => {
			const preset = PRESETS.find((p) => p.id === b.dataset.preset)
			if (!preset) return
			source.value = preset.source
			draw()
		})
	}

	document.querySelector<HTMLButtonElement>('#pg-reset')?.addEventListener('click', () => {
		source.value = DEFAULT_SOURCE
		draw()
	})

	draw()
}
