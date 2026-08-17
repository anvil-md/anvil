import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const assetPrefix = 'lib'

export default defineConfig({
	site: 'https://anvil-md.frst.dev',
	output: 'static',
	outDir: 'dist',

	// Keep whitespace between inline elements - the default strips the space
	// after e.g. a </strong> at a line end, silently gluing words together.
	compressHTML: false,

	build: { inlineStylesheets: 'always' },
	prefetch: false,

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
