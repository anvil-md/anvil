import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * The specification text, one file per numbered section.
 *
 * These files are GENERATED from SPEC.md at the repo root by
 * `bun run scripts/split-spec.ts`. Edit the spec, not these.
 */
const spec = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/spec' }),
	schema: z.object({
		title: z.string(),
		nav: z.string(),
		section: z.number(),
		summary: z.string(),
	}),
})

export const collections = { spec }
