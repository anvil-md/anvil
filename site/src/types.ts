/**
 * Content model for the one-pager. Everything the site renders comes from
 * `src/page.ts` and nothing else. Adding content = editing that one file.
 */

import type { PresetName } from '@/lib/presets'

export type Cta = {
	label: string
	href: string
	/** 'solid' is the accent-filled primary button, 'ghost' is the quiet one. */
	variant?: 'solid' | 'ghost'
}

export type Link = {
	label: string
	href: string
}

/** Text fields accept markdown-lite: **bold**, *italic*, `code`, [link](url), plus raw HTML. */
type Common = {
	/** Anchor id. Must be unique, kebab-case. Used for #links and nav. */
	id: string
	/** Label in the sticky nav. Omit to keep the section out of the nav. */
	nav?: string
	title?: string
	lead?: string
}

export type Section =
	| (Common & { kind: 'prose'; body: string[] })
	| (Common & {
			kind: 'features'
			columns?: 2 | 3 | 4
			items: { title: string; body: string; icon?: string }[]
	  })
	| (Common & { kind: 'steps'; items: { title: string; body: string }[] })
	| (Common & { kind: 'stats'; items: { value: string; label: string }[] })
	| (Common & { kind: 'quote'; quote: string; attribution?: string })
	| (Common & { kind: 'faq'; items: { q: string; a: string }[] })
	| (Common & { kind: 'cta'; ctas: Cta[] })
	| (Common & {
			kind: 'diagram'
			/**
			 * Mermaid source. Laid out and rendered at BUILD time, so a diagram
			 * costs no runtime JavaScript and cannot fail in someone's browser.
			 * A syntax error is a build error.
			 *
			 * Supported: flowchart/graph, sequenceDiagram, classDiagram,
			 * erDiagram, stateDiagram, xychart.
			 *
			 * How it is drawn is the preset's business, not yours - the same
			 * source comes out as a clean SVG, as box-drawing characters, or
			 * hand-sketched. See `layout.diagram` in src/lib/presets.ts.
			 */
			source: string
			/** Sits under the figure, small and muted. */
			caption?: string
	  })

export type Page = {
	meta: {
		title: string
		description: string
		lang?: string
		/** Absolute or site-relative path to an OG image, e.g. '/og.png'. */
		ogImage?: string
	}
	theme: {
		/**
		 * The design language. Owns palette, fonts, type scale, rules, radii,
		 * texture and motion - see src/lib/presets.ts for the list and
		 * src/styles/presets.css for what each one does.
		 */
		preset: PresetName
		/**
		 * Optional accent override. Any hex; readable text on top of it is
		 * computed automatically. Omit to take the preset's own accent, which is
		 * usually the right call - the presets are tuned.
		 */
		accent?: string
	}
	/** Small wordmark in the top-left of the sticky nav. */
	brand?: string
	hero: {
		eyebrow?: string
		title: string
		lead?: string
		ctas?: Cta[]
	}
	sections: Section[]
	footer?: {
		text?: string
		links?: Link[]
	}
}
