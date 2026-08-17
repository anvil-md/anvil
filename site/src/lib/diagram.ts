/**
 * Diagrams, rendered at BUILD time.
 *
 * `beautiful-mermaid` has zero DOM dependencies, so the whole thing - parse,
 * ELK layout, render - runs in the Astro frontmatter. A diagram therefore costs
 * no runtime JavaScript, cannot fail in someone's browser, and a syntax error
 * in the Mermaid source is a build error rather than an empty box on a live
 * page.
 *
 * The same source comes out looking like whichever preset is asking, because
 * how a diagram is drawn is a design decision and design decisions belong to
 * the preset. See `layout.diagram` in lib/presets.ts.
 */
import { renderMermaidASCII, renderMermaidSVG } from 'beautiful-mermaid'

/** How a preset draws a diagram. */
export type DiagramMode = 'svg' | 'ascii' | 'sketch'

export type Rendered = { kind: 'svg'; html: string } | { kind: 'ascii'; text: string }

/**
 * Layout is tuned once, here, rather than per preset: node spacing is a
 * legibility decision, not a stylistic one, and a diagram that reads well in
 * one preset reads well in all of them.
 */
const LAYOUT = { padding: 6, nodeSpacing: 30, layerSpacing: 46 } as const

/**
 * Edge labels come out at 11px against 13px node labels, which on a figure
 * scaled to fit a column is the difference between reading "type error" and
 * seeing a grey smudge. The words on the arrows carry the logic of a flowchart -
 * they are not a footnote.
 */
const EDGE_LABEL_SCALE = 1.25

/** Rewrite one numeric attribute of an SVG tag, by exact name. */
function attr(tag: string, name: string, fn: (v: number) => number): string {
	// The lookbehind matters: a bare /x="/ also matches the x inside rx=".
	return tag.replace(new RegExp(`(?<![\\w-])${name}="(-?[\\d.]+)"`), (_, v) => {
		return `${name}="${Number(fn(Number(v)).toFixed(3))}"`
	})
}

/**
 * Grow the label chips. The layout engine sized each chip around 11px text, so
 * the chip has to grow with the words or they burst out of it - it is scaled
 * about its own centre, which is the point the layout engine positioned.
 */
function enlargeEdgeLabels(svg: string): string {
	const k = EDGE_LABEL_SCALE
	return svg.replace(/<g class="edge-label"[\s\S]*?<\/g>/g, group =>
		group
			.replace(/<rect\b[^>]*\/>/, tag => {
				const w = Number(tag.match(/(?<![\w-])width="([\d.]+)"/)?.[1] ?? 0)
				const h = Number(tag.match(/(?<![\w-])height="([\d.]+)"/)?.[1] ?? 0)
				let out = attr(tag, 'x', v => v - (w * (k - 1)) / 2)
				out = attr(out, 'y', v => v - (h * (k - 1)) / 2)
				out = attr(out, 'width', v => v * k)
				return attr(out, 'height', v => v * k)
			})
			// dy is the baseline nudge that centres the text in its chip, so it only
			// stays centred if it scales with the type.
			.replace(/<text\b[^>]*>/, tag =>
				attr(
					attr(tag, 'font-size', v => v * k),
					'dy',
					v => v * k,
				),
			),
	)
}

/**
 * beautiful-mermaid emits its SVG themed entirely through CSS custom
 * properties - `--bg`, `--fg`, `--line`, `--accent`, `--muted` - with
 * `color-mix()` fallbacks for the rest. Those are the same names the presets
 * already set on `<html>`.
 *
 * So it is rendered ONCE, with no colours baked in, and every preset themes it
 * for free by cascade. Ten looks, one render, and a preset that retunes its
 * palette retunes its diagrams with it.
 */
function responsive(svg: string): string {
	return (
		svg
			// The generator pins width/height in px, which makes the figure a fixed
			// object in a fluid column - it would overflow on a phone. viewBox alone
			// carries the aspect ratio.
			.replace(/^(<svg[^>]*?)\s+width="[\d.]+"\s+height="[\d.]+"/, '$1')
			/* The generator ALSO writes its light defaults as inline custom
			   properties on the root <svg> - `style="--bg:#FFFFFF;--fg:#27272A"`.
			   An inline style beats anything inherited, so every dark preset was
			   getting white node boxes with near-black labels stamped on a black
			   page. Stripping them is what actually makes the cascade work, and
			   with it the one-render-many-looks claim above. */
			.replace(/^(<svg[^>]*?)\s+style="[^"]*"/, '$1')
			// A Google Fonts @import inside inline SVG is a blocking network request
			// per diagram, for a face the preset has already chosen. The `text` rule
			// it leaves behind is a bare element selector, so `.op-diagram text` in
			// global.css outranks it.
			.replace(/@import url\([^)]*\);?/g, '')
	)
}

export function renderDiagram(source: string, mode: DiagramMode): Rendered {
	if (mode === 'ascii') {
		// Box-drawing characters rather than +-|, which is what a terminal has
		// actually been able to draw since VT100 and what these presets are of.
		return { kind: 'ascii', text: renderMermaidASCII(source, { colorMode: 'none' }) }
	}
	// 'sketch' renders the same clean SVG as 'svg'. lib/sketch.ts redraws it with
	// rough.js in place at runtime; if that never arrives, this is what shows,
	// which is a real diagram rather than a hole in the page.
	return {
		kind: 'svg',
		html: enlargeEdgeLabels(responsive(renderMermaidSVG(source, { transparent: true, ...LAYOUT }))),
	}
}
