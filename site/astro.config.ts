import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const assetPrefix = 'lib'

export default defineConfig({
	site: 'https://anvil-md.frst.dev',
	output: 'static',
	outDir: 'dist',

	build: {
		// One page, small CSS: inline it and skip the extra request entirely.
		inlineStylesheets: 'always',
	},

	prefetch: false,

	vite: {
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				'@': new URL('./src', import.meta.url).pathname,
				// The site eats its own dog food: every ANVIL block on the page is
				// rendered at build time by the real packages in this repo, from
				// source. No copies, no screenshots -- if the renderer regresses,
				// the site shows it.
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
