/**
 * Design presets. A preset is a whole design language - typography, type scale,
 * rules, radii, texture, motion - not a colour swap. Adding one here and giving
 * it a block in `src/styles/presets.css` is all it takes.
 */

export type PresetName =
	| 'corporate'
	| 'brutal'
	| 'editorial'
	| 'sixties'
	| 'paper'
	| 'noir'
	| 'terminal'
	| 'tokyonight'
	| 'ansi'
	| 'whiteboard'

/**
 * Structural layout, not decoration. This is what stops the presets being nine
 * colour skins over one skeleton: components render genuinely different DOM
 * depending on these, so two presets can disagree about the SHAPE of the page.
 */
export type Layout = {
	/** banner = full-bleed accent slab, split = title/lead in two columns. */
	hero: 'centred' | 'left' | 'split' | 'banner'
	/** rows = full-width bars, index = numbered hairline list, grid = cards. */
	features: 'grid' | 'rows' | 'index'
	/** Vertical rhythm of every section. */
	density: 'tight' | 'normal' | 'airy'
	/** Reading measure for prose. */
	measure: 'narrow' | 'normal' | 'wide'
	/**
	 * How a `diagram` section is drawn. Not decoration - a diagram in a preset
	 * that IS a terminal should be box-drawing characters, and one on a
	 * whiteboard should look drawn by hand.
	 *
	 * svg    - clean vector, themed by this preset's own tokens.
	 * ascii  - box-drawing characters in a <pre>.
	 * sketch - the same SVG, redrawn by rough.js at runtime (lib/sketch.ts).
	 */
	diagram: 'svg' | 'ascii' | 'sketch'
}

export type Preset = {
	label: string
	/** One line, shown in the style guide. */
	blurb: string
	mode: 'dark' | 'light'
	accent: string
	/** null when the face is self-hosted from public/fonts. */
	fontLink: string | null
	display: string
	body: string
	mono: string
	layout: Layout
}

const PLEX = '"IBM Plex Mono", ui-monospace, monospace'
const INTER = 'Inter, system-ui, -apple-system, sans-serif'

export const PRESETS: Record<PresetName, Preset> = {
	corporate: {
		label: 'Corporate',
		blurb: 'Professional monotone. Near-grey, one restrained accent, tight grid, no decoration.',
		mode: 'light',
		accent: '#16233d',
		fontLink:
			'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400..700&family=Inter:wght@300..600&family=IBM+Plex+Mono:wght@400&display=swap',
		display: '"Inter Tight", system-ui, sans-serif',
		body: INTER,
		mono: PLEX,
		layout: {
			hero: 'split',
			features: 'grid',
			density: 'normal',
			measure: 'normal',
			diagram: 'svg',
		},
	},
	brutal: {
		label: 'Brutal',
		blurb: 'Swiss brutalist. Black hairlines, zero radius, expanded display type set tight.',
		mode: 'light',
		accent: '#1f1fff',
		fontLink:
			'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;600&display=swap',
		display: 'Archivo, system-ui, sans-serif',
		body: 'Archivo, system-ui, sans-serif',
		mono: PLEX,
		layout: { hero: 'banner', features: 'rows', density: 'tight', measure: 'wide', diagram: 'svg' },
	},
	editorial: {
		label: 'Editorial',
		blurb: 'Magazine feature. Fraunces at size, hairline rules, a drop cap, wide margins.',
		mode: 'light',
		accent: '#a3401f',
		fontLink:
			'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..900&family=Inter:wght@300..700&family=IBM+Plex+Mono:wght@400&display=swap',
		display: 'Fraunces, Georgia, serif',
		body: INTER,
		mono: PLEX,
		layout: { hero: 'left', features: 'index', density: 'airy', measure: 'narrow', diagram: 'svg' },
	},
	sixties: {
		label: 'Sixties',
		blurb: 'Mid-century modern. Futura-ish geometry, mustard and teal on cream, hard circles.',
		mode: 'light',
		accent: '#b8500f',
		fontLink:
			'https://fonts.googleapis.com/css2?family=Jost:wght@300..700&family=IBM+Plex+Mono:wght@400&display=swap',
		display: 'Jost, Futura, system-ui, sans-serif',
		body: 'Jost, Futura, system-ui, sans-serif',
		mono: PLEX,
		layout: {
			hero: 'centred',
			features: 'grid',
			density: 'normal',
			measure: 'normal',
			diagram: 'svg',
		},
	},
	terminal: {
		label: 'Terminal',
		blurb: 'Phosphor CRT. Mono throughout, scanlines, bracket rules, a blinking caret.',
		mode: 'dark',
		accent: '#4ade80',
		fontLink:
			'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&display=swap',
		display: PLEX,
		body: PLEX,
		mono: PLEX,
		layout: {
			hero: 'left',
			features: 'index',
			density: 'tight',
			measure: 'wide',
			diagram: 'ascii',
		},
	},
	noir: {
		label: 'Noir',
		blurb: 'Cinematic dark. High-contrast Bodoni, enormous negative space, one slow glow.',
		mode: 'dark',
		accent: '#e8b866',
		fontLink:
			'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400..900&family=Inter:wght@300..600&display=swap',
		display: '"Bodoni Moda", Didot, Georgia, serif',
		body: INTER,
		mono: PLEX,
		layout: {
			hero: 'centred',
			features: 'rows',
			density: 'airy',
			measure: 'narrow',
			diagram: 'svg',
		},
	},
	paper: {
		label: 'Paper',
		blurb: 'Letterpress. Warm stock, ink-black serif, printed grain, restrained to a whisper.',
		mode: 'light',
		accent: '#8a3324',
		fontLink:
			'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,200..700&family=IBM+Plex+Mono:wght@400&display=swap',
		display: 'Newsreader, Georgia, serif',
		body: 'Newsreader, Georgia, serif',
		mono: PLEX,
		layout: {
			hero: 'centred',
			features: 'index',
			density: 'airy',
			measure: 'narrow',
			diagram: 'svg',
		},
	},
	tokyonight: {
		label: 'Tokyo Night',
		blurb: 'Slate-blue dark, never pure black. Cascading contrast, soft glow, editor chrome.',
		mode: 'dark',
		accent: '#f472b6',
		fontLink:
			'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@300..600&display=swap',
		display: '"JetBrains Mono", ui-monospace, monospace',
		body: INTER,
		mono: '"JetBrains Mono", ui-monospace, monospace',
		layout: {
			hero: 'split',
			features: 'grid',
			density: 'tight',
			measure: 'normal',
			diagram: 'ascii',
		},
	},
	ansi: {
		label: 'ANSI / BBS',
		blurb: 'Dial-up art. CGA sixteen, box-drawing frames, block shading, 80-column measure.',
		mode: 'dark',
		accent: '#55ffff',
		fontLink:
			'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap',
		display: PLEX,
		body: PLEX,
		mono: PLEX,
		layout: {
			hero: 'banner',
			features: 'rows',
			density: 'tight',
			measure: 'wide',
			diagram: 'ascii',
		},
	},
	whiteboard: {
		label: 'Whiteboard',
		blurb: 'Excalidraw on a whiteboard. Hachure fills, double-drawn boxes, nothing straight.',
		mode: 'light',
		accent: '#1a4fa0',
		// Excalifont is Excalidraw's own font (OFL-1.1, 25kB), self-hosted from
		// public/fonts rather than pulled off a CDN at request time.
		fontLink: null,
		display: 'Excalifont, "Comic Sans MS", cursive',
		body: 'Excalifont, "Comic Sans MS", cursive',
		mono: PLEX,
		layout: {
			hero: 'left',
			features: 'grid',
			density: 'normal',
			measure: 'normal',
			diagram: 'sketch',
		},
	},
}

export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[]
