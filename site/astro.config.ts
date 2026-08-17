import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const assetPrefix = 'lib'

/** Hex approximations of the oklch design tokens in global.css. */
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
	settings: tokens({ comment: '#9296a0', accent: '#1f5aa8', ink: '#1b1c22' }),
}

const anvilDark = {
	name: 'anvil-dark',
	type: 'dark' as const,
	fg: '#b0b2bc',
	bg: '#24252a',
	settings: tokens({ comment: '#7d7f89', accent: '#7cb3f5', ink: '#eef0f4' }),
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
		// light/dark toggle. `anvil` is aliased to yaml, whose key:value +
		// #comment shape is the closest match to an ANVIL fence.
		syntaxHighlight: 'shiki',
		shikiConfig: {
			themes: { light: anvilLight, dark: anvilDark },
			defaultColor: false,
			langAlias: { anvil: 'yaml' },
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
