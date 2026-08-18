#!/usr/bin/env bun
/**
 * SPEC.md -> site/src/content/spec/NN-slug.md
 *
 * The spec is written once, in SPEC.md at the repo root. The site renders that
 * text rather than a copy of it, so the two cannot drift. Re-run this after
 * editing SPEC.md:
 *
 *   bun run scripts/split-spec.ts
 *
 * Everything below the first `## ` heading up to the next one becomes a
 * section. The trailing ASCII colophon after the last `---` is dropped: it is
 * decoration for a plain-text reader, and the site has its own footer.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, 'site/src/content/spec')

/** Short sidebar label + the one-line summary shown on the section index. */
const META: Record<string, { nav: string; summary: string }> = {
	'0': {
		nav: 'Overview',
		summary:
			'The whole idea in sixty seconds: a fenced block going down, a structured tag coming up, and nothing in between.',
	},
	'1': {
		nav: 'The axiom',
		summary:
			'One sentence about append-only transcripts, from which every other rule in this document follows.',
	},
	'2': {
		nav: 'Vocabulary',
		summary:
			'Twelve blocks, two containers and one directive, why the set is closed, and why @markdown deliberately does not exist.',
	},
	'3': {
		nav: 'Grammar',
		summary:
			'Sigils, the line shapes, and why the in-block literal delimiter is ~~~ rather than a nested backtick fence.',
	},
	'4': {
		nav: 'Blocks',
		summary:
			'Every block in turn: attributes, the rows it accepts, and what it renders as, open and stamped. Including @card, @board, @message and the two layout containers.',
	},
	'5': {
		nav: 'Streaming',
		summary:
			'Every prefix of a fence is a real input. Blocks stay inert until the fence closes.',
	},
	'6': {
		nav: 'The stamp',
		summary:
			'The answer half: the <stamp> tag, its payload per block kind, and why it renders as the frozen block rather than a second bubble.',
	},
	'7': {
		nav: 'Lifecycle',
		summary:
			'The five laws, the state machine, idempotency on (blockId, nonce), expiry, reload safety and secrets.',
	},
	'8': {
		nav: 'Security',
		summary:
			'Stamps are untrusted input, stamping is permission-gated, and attribute-position values are allowlisted rather than escaped.',
	},
	'9': {
		nav: 'Rendering',
		summary:
			'Twelve interaction rules, each of which has cost someone a bug: focus, height, motion, keyboard, semantics, mobile.',
	},
	'10': {
		nav: 'Authoring',
		summary:
			'How an agent should use this: what to reach for, what to avoid, and how to run an interview rather than a form.',
	},
	'11': {
		nav: 'Parser contract',
		summary:
			'The parser is total. What every malformed input degrades to, and why derived ids must come from content.',
	},
	'12': {
		nav: 'Failure modes',
		summary: 'Twenty-two ways to get this wrong, ranked by how much each one hurts, with the guard for each.',
	},
	'13': { nav: 'Reference card', summary: 'The whole language on one screen.' },
	'14': {
		nav: 'Conformance',
		summary: 'The ten things an implementation must do to call itself ANVIL v1 conformant.',
	},
}

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

const yaml = (s: string) => `"${s.replace(/"/g, '\\"')}"`

const src = await readFile(join(ROOT, 'SPEC.md'), 'utf8')

// Drop the trailing ASCII colophon - decoration for a plain-text reader.
const body = src.slice(0, src.lastIndexOf('\n---\n\n```\n'))

const parts = body.split(/^## /m).slice(1)
if (parts.length < 10) throw new Error(`only found ${parts.length} sections - did SPEC.md change shape?`)

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

let written = 0
for (const part of parts) {
	const nl = part.indexOf('\n')
	const heading = part.slice(0, nl).trim()
	const m = heading.match(/^(\d+)\.\s+(.*)$/)
	if (!m) throw new Error(`unnumbered section heading: ${heading}`)
	const [, num, title] = m
	const meta = META[num!]
	if (!meta) throw new Error(`no META entry for section ${num}`)

	// Strip the horizontal rule that separates sections in the flat document.
	const text = part
		.slice(nl + 1)
		.replace(/\n---\s*$/, '')
		.trim()

	const file = `${String(num).padStart(2, '0')}-${slug(title!)}.md`
	const front = [
		'---',
		`title: ${yaml(title!)}`,
		`nav: ${yaml(meta.nav)}`,
		`section: ${num}`,
		`summary: ${yaml(meta.summary)}`,
		'---',
		'',
		text,
		'',
	].join('\n')

	await writeFile(join(OUT, file), front)
	written++
}

console.log(`wrote ${written} sections -> site/src/content/spec/`)
