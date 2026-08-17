import { PRESETS } from '@/lib/presets'
import type { Page } from '@/types'

function luminance(hex: string): number {
	const h = hex.replace('#', '')
	const full = h.length === 3 ? [...h].map(c => c + c).join('') : h
	const [r, g, b] = [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16) / 255)
	const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

/**
 * Ink for text sitting ON the accent - button labels, step markers.
 *
 * Compares both candidates rather than testing luminance against a magic
 * threshold. The threshold version picked white for mid-tone accents like
 * mustard and hot pink, landing at 2.65:1 on a button label that black would
 * have rendered at 7:1.
 */
export function contrastOn(hex: string): string {
	const dark = '#08080a'
	const light = '#ffffff'
	return ratio(dark, hex) >= ratio(light, hex) ? dark : light
}

/**
 * The preset supplies everything, including whether it's a light or dark design.
 * `accent` in page.ts is the one optional override.
 */
export function resolveTheme(theme: Page['theme']) {
	const name = theme.preset
	const preset = PRESETS[name]
	const accent = theme.accent ?? preset.accent

	return {
		name,
		preset,
		mode: preset.mode,
		accent,
		style: [
			`--accent:${accent}`,
			`--accent-fg:${contrastOn(accent)}`,
			`--font-display:${preset.display}`,
			`--font-body:${preset.body}`,
			`--font-mono:${preset.mono}`,
		].join(';'),
	}
}
