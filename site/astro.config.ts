import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { anvilGrammar } from './src/grammars/anvil.tmlanguage'
import { ANVIL_TOKENS, type AnvilTokenRole } from './src/scripts/anvil-tokens'

const assetPrefix = 'lib'

/**
 * Hex approximations of the oklch design tokens in global.css.
 *
 * Shiki resolves a theme to inline hex at build time, so the ```anvil listings
 * cannot read the CSS custom properties the playground's overlay uses. The
 * token NAMES are shared (src/scripts/anvil-tokens.ts); these are the same
 * seven roles, spelled in sRGB. `primary` `warn` `danger` are lifted verbatim
 * from packages/render-html/anvil.css so a checkbox state is the same colour
 * in a listing as it is in a rendered block.
 */
const roles: Record<'light' | 'dark', Record<AnvilTokenRole, string>> = {
	light: {
		grammar: '#1f5aa8',
		ink: '#1b1c22',
		soft: '#4a4b53',
		faint: '#9296a0',
		primary: '#2563eb',
		warn: '#b45309',
		danger: '#c0392a',
	},
	dark: {
		grammar: '#7cb3f5',
		ink: '#eef0f4',
		soft: '#b0b2bc',
		faint: '#7d7f89',
		primary: '#6ea8fe',
		warn: '#f0b429',
		danger: '#ff6b57',
	},
}

/** One theme rule per ANVIL token, straight off the shared vocabulary. */
const anvilTokens = (mode: 'light' | 'dark') =>
	Object.values(ANVIL_TOKENS).map((t) => {
		const fontStyle = [t.bold ? 'bold' : '', t.italic ? 'italic' : ''].filter(Boolean).join(' ')
		return {
			scope: [t.scope],
			settings: fontStyle
				? { foreground: roles[mode][t.role], fontStyle }
				: { foreground: roles[mode][t.role] },
		}
	})

const tokens = (c: { comment: string; accent: string; ink: string }) => [
	{
		scope: ['comment', 'punctuation.definition.comment'],
		settings: { foreground: c.comment, fontStyle: 'italic' },
	},
	{
		scope: ['keyword', 'keyword.control', 'storage', 'storage.type', 'entity.name.tag'],
		settings: { foreground: c.accent },
	},
	{
		scope: ['string', 'string.quoted', 'punctuation.definition.string', 'meta.attribute'],
		settings: { foreground: c.ink },
	},
	{ scope: ['constant.numeric', 'constant.language.boolean'], settings: { foreground: c.ink } },
	{ scope: ['entity.name.function', 'support.function'], settings: { foreground: c.ink } },
]

const anvilLight = {
	name: 'anvil-light',
	type: 'light' as const,
	fg: '#4a4b53',
	bg: '#f1f0ed',
	settings: [
		...tokens({ comment: '#9296a0', accent: '#1f5aa8', ink: '#1b1c22' }),
		...anvilTokens('light'),
	],
}

const anvilDark = {
	name: 'anvil-dark',
	type: 'dark' as const,
	fg: '#b0b2bc',
	bg: '#24252a',
	settings: [
		...tokens({ comment: '#7d7f89', accent: '#7cb3f5', ink: '#eef0f4' }),
		...anvilTokens('dark'),
	],
}

export default defineConfig({
	site: 'https://anvil-md.frst.dev',
	output: 'static',
	outDir: 'dist',

	// Keep whitespace between inline elements - the default strips the space
	// after e.g. a </strong> at a line end, silently gluing words together.
	compressHTML: false,

	build: { inlineStylesheets: 'always' },
	prefetch: { defaultStrategy: 'tap', prefetchAll: true },
	trailingSlash: 'always',

	markdown: {
		// Restrained highlighting on the brand palette: keywords carry the slate
		// accent, strings and numbers sit at ink, comments recede. No rainbow -
		// a spec listing should read like print. Two themes so it follows the
		// light/dark toggle.
		//
		// ```anvil used to borrow yaml's grammar, which got the #comment right
		// and everything else wrong. It now has its own, generated from the
		// parser's own ANVIL_KINDS -- see src/grammars/anvil.tmlanguage.ts.
		syntaxHighlight: 'shiki',
		shikiConfig: {
			themes: { light: anvilLight, dark: anvilDark },
			defaultColor: false,
			langs: [anvilGrammar],
			wrap: false,
		},
	},

	vite: {
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				'@': new URL('./src', import.meta.url).pathname,
				// The page renders its own blocks: every ANVIL example is produced at
				// build time by the real packages in this repo, from source. Nothing
				// here is a screenshot, so a renderer regression shows up on the page.
				'@anvil-md/parser': new URL('../packages/parser/src/index.ts', import.meta.url).pathname,
				'@anvil-md/render-html': new URL('../packages/render-html/src/index.ts', import.meta.url)
					.pathname,
				// Used by the examples test, which refuses to let the examples page
				// teach ANVIL that the linter rejects.
				'@anvil-md/lint': new URL('../packages/lint/src/index.ts', import.meta.url).pathname,
			},
		},
		build: {
			rollupOptions: {
				output: {
					hashCharacters: 'base36',
					chunkFileNames: `${assetPrefix}/[hash].js`,
					entryFileNames: `${assetPrefix}/[hash].js`,
					assetFileNames: `${assetPrefix}/[hash].[ext]`,
				},
			},
		},
	},
})
