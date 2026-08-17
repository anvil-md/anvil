/**
 * Hand-drawn shapes for the `whiteboard` preset.
 *
 * Excalidraw's look does not come from a border style. It comes from rough.js
 * drawing every single shape with its OWN random seed, and that is the one
 * thing no CSS technique can fake:
 *
 *   - `border-image` paints one tile, so every box on the page comes out
 *     identical - the exact opposite of hand-drawn - and it degenerates to
 *     corner marks on anything narrower than twice the slice.
 *   - `feTurbulence` + `feDisplacementMap` varies per element, but it MOVES
 *     PIXELS: displace a stroke further than it is wide and the line tears.
 *     That caps how rough it can get well below "drawn".
 *
 * So this does what Excalidraw does: the same library, the same options, into
 * one inline SVG per element, redrawn at the element's real measured size.
 *
 * It is loaded behind a preset guard in BaseLayout, and imported dynamically so
 * Vite splits it into its own chunk. The other nine presets fetch none of it.
 */
import type { Options } from 'roughjs/bin/core'
import { RoughSVG } from 'roughjs/bin/svg'

const SVGNS = 'http://www.w3.org/2000/svg'

type Shape = 'box' | 'ellipse' | 'rule' | 'vrule' | 'rows' | 'swipe'

interface Spec {
	selector: string
	shape: Shape
	/** Which edge a `rule` sits on. */
	at?: 'top' | 'bottom'
	/**
	 * Custom-property names, cycled across the matched elements so neighbouring
	 * cards never land on the same fill. Read from CSS rather than hard-coded so
	 * the palette stays in one place.
	 */
	fills?: readonly string[]
	strokeWidth?: number
	/** Multiplier on Excalidraw's own hachureGap of `strokeWidth * 4`. */
	gap?: number
}

/**
 * Excalidraw's fills are deliberately pale, and its hachure is dense enough to
 * read as scribble rather than as a pattern. Anything with body text over it
 * gets a wider gap than Excalidraw's default - a card is not a sticky note.
 */
const SPECS: readonly Spec[] = [
	{
		selector: '.op-card',
		shape: 'box',
		strokeWidth: 2.2,
		fills: ['--ex-fill-blue', '--ex-fill-green', '--ex-fill-red', '--ex-fill-yellow'],
		gap: 1.7,
	},
	{ selector: '.op-btn-solid', shape: 'box', strokeWidth: 2, fills: ['--ex-fill-blue'], gap: 1.5 },
	{ selector: '.op-btn-ghost', shape: 'box', strokeWidth: 2 },
	{ selector: '.op-hero .op-eyebrow', shape: 'box', strokeWidth: 1.8 },
	{ selector: '.op-icon', shape: 'box', strokeWidth: 1.6, fills: ['--ex-fill-yellow'], gap: 1.2 },
	{
		selector: '.op-step-marker',
		shape: 'ellipse',
		strokeWidth: 1.6,
		fills: ['--ex-fill-yellow', '--ex-fill-green', '--ex-fill-red'],
		gap: 0.9,
	},
	{ selector: '.op-section', shape: 'rule', strokeWidth: 2.4 },
	{ selector: '.op-nav', shape: 'rule', at: 'bottom', strokeWidth: 1.6 },
	{ selector: '.op-steps', shape: 'vrule', strokeWidth: 2 },
	{ selector: '.op-faq', shape: 'rows', strokeWidth: 1.8 },
	{ selector: 'header > .op-h2', shape: 'swipe', fills: ['--ex-fill-yellow'] },
]

const root = document.documentElement

function cssVar(name: string, fallback: string): string {
	return getComputedStyle(root).getPropertyValue(name).trim() || fallback
}

/**
 * FNV-1a over a stable key. rough.js reshuffles a shape completely for a new
 * seed, so the seed has to survive a resize - deriving it from the element's
 * position in the document does that, and still gives every shape its own.
 */
function seedOf(key: string): number {
	let h = 0x811c9dc5
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return (h >>> 0) % 2 ** 31
}

/**
 * Excalidraw's own `adjustRoughness`. Roughness is an absolute wobble in px, so
 * on a 24px chip the same value that flatters a 400px card eats the shape. This
 * is why small elements broke under every previous approach; Excalidraw solved
 * it by scaling roughness down rather than by special-casing the CSS.
 */
function adjustRoughness(w: number, h: number, roughness: number): number {
	const max = Math.max(w, h)
	const min = Math.min(w, h)
	if (max >= 50 && min >= 20) return roughness
	return Math.min(roughness / (max < 10 ? 3 : 2), 2.5)
}

/**
 * Excalidraw's rounded rectangle, vertex for vertex: an adaptive radius (a
 * quarter of the short side, capped at 32px) and one continuous path, so
 * rough.js roughens the corners as part of the same stroke instead of drawing
 * four arcs that do not meet.
 */
function roundRect(x: number, y: number, w: number, h: number): string {
	const r = Math.min(32, Math.min(w, h) * 0.25)
	const x2 = x + w
	const y2 = y + h
	return [
		`M ${x + r} ${y}`,
		`L ${x2 - r} ${y}`,
		`Q ${x2} ${y}, ${x2} ${y + r}`,
		`L ${x2} ${y2 - r}`,
		`Q ${x2} ${y2}, ${x2 - r} ${y2}`,
		`L ${x + r} ${y2}`,
		`Q ${x} ${y2}, ${x} ${y2 - r}`,
		`L ${x} ${y + r}`,
		`Q ${x} ${y}, ${x + r} ${y}`,
	].join(' ')
}

interface Target {
	el: HTMLElement
	svg: SVGSVGElement
	rc: RoughSVG
	spec: Spec
	seed: number
	fill: string | null
	w: number
	h: number
}

function mount(el: HTMLElement, spec: Spec, index: number): Target {
	const svg = document.createElementNS(SVGNS, 'svg')
	svg.setAttribute('class', 'op-sketch')
	svg.setAttribute('aria-hidden', 'true')
	svg.setAttribute('preserveAspectRatio', 'none')
	el.prepend(svg)
	const fills = spec.fills
	return {
		el,
		svg,
		rc: new RoughSVG(svg),
		spec,
		seed: seedOf(`${spec.selector}#${index}`),
		fill: fills ? cssVar(fills[index % fills.length], '#a5d8ff') : null,
		w: 0,
		h: 0,
	}
}

function draw(t: Target, force = false): void {
	const { el, svg, rc, spec } = t
	const w = el.offsetWidth
	const h = el.offsetHeight
	if (w < 4 || h < 4) return
	if (!force && w === t.w && h === t.h) return
	t.w = w
	t.h = h

	// viewBox matches the element box 1:1, so nothing is ever scaled and the
	// stroke keeps a constant width at any breakpoint. Strokes that overshoot a
	// corner - which is most of what makes a line look drawn - are allowed out
	// by `overflow: visible` in CSS.
	svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
	svg.replaceChildren()

	const sw = spec.strokeWidth ?? 2
	const ink = cssVar('--fg', '#1e1e1e')

	/* Excalidraw's generateRoughOptions(), numbers included. fillWeight and
	   hachureGap are derived from stroke width there too - that proportion is
	   what keeps a hachure reading as the same pen that drew the outline. */
	const base: Options = {
		seed: t.seed,
		roughness: adjustRoughness(w, h, 1),
		bowing: 1,
		stroke: ink,
		strokeWidth: sw,
		fillWeight: sw / 2,
		hachureGap: sw * 4 * (spec.gap ?? 1),
		fillStyle: 'hachure',
	}

	switch (spec.shape) {
		case 'box': {
			const pad = sw
			svg.appendChild(
				rc.path(roundRect(pad, pad, w - pad * 2, h - pad * 2), {
					...base,
					fill: t.fill ?? undefined,
					// Excalidraw passes this for its rounded rects: it pins the path's
					// vertices so the corners still meet after roughening.
					preserveVertices: true,
				}),
			)
			break
		}
		case 'ellipse': {
			svg.appendChild(
				rc.ellipse(w / 2, h / 2, w - sw * 2, h - sw * 2, {
					...base,
					fill: t.fill ?? undefined,
					fillStyle: 'solid',
				}),
			)
			break
		}
		case 'rule': {
			// A line drawn across the board freehand: it starts and stops short of
			// the edges and bows, because an arm pivots. roughness is an absolute
			// wobble in px, so at 1200px wide the default reads as a ruled line -
			// long rules need more of it, not less.
			const y = spec.at === 'bottom' ? h - sw : sw
			svg.appendChild(rule(rc, w * 0.045, w * 0.965, y, { ...base, roughness: 1.9, bowing: 2.2 }))
			break
		}
		case 'vrule': {
			// The rail a numbered list hangs off. Vertical, so it bows sideways.
			svg.appendChild(vrule(rc, sw, h * 0.012, h * 0.988, { ...base, roughness: 1.6, bowing: 1.8 }))
			break
		}
		case 'rows': {
			// One SVG for the whole list: the container is the only thing that knows
			// where every row starts, so it draws all the separators itself.
			const rows = [...el.children].filter(
				(c): c is HTMLElement => c instanceof HTMLElement && c.tagName === 'DETAILS',
			)
			const ys = rows.map(r => r.offsetTop)
			ys.push(h)
			for (const [i, y] of ys.entries()) {
				svg.appendChild(
					rule(rc, 0, w, Math.min(Math.max(y, sw), h - sw), {
						...base,
						seed: t.seed + i * 977,
						bowing: 1.6,
					}),
				)
			}
			break
		}
		case 'swipe': {
			// A highlighter stroke, overshooting both ends the way a real one does.
			// Single-stroke: rough.js draws a line twice by default, which at 20px
			// wide reads as two fat bars rather than one swipe.
			const thickness = Math.max(11, h * 0.44)
			const y = h - thickness * 0.42
			const g = rc.line(-5, y, w + 11, y - 3, {
				...base,
				stroke: t.fill ?? '#ffec99',
				strokeWidth: thickness,
				roughness: 1.4,
				bowing: 3,
				disableMultiStroke: true,
			})
			g.setAttribute('stroke-linecap', 'round')
			svg.appendChild(g)
			break
		}
	}
}

/**
 * A rule is always ONE stroke, unlike a box.
 *
 * rough.js draws every line twice by default, which is right for a shape - it
 * is most of why a rough box reads as drawn. On a rule it is wrong: two strokes
 * bow independently, so over 900px they meet at the ends and part in the middle
 * and the "line" comes out as a long thin lens. A rule someone actually drew is
 * one pass of the pen.
 */
function rule(rc: RoughSVG, x1: number, x2: number, y: number, options: Options): SVGGElement {
	const g = rc.line(x1, y, x2, y, { ...options, disableMultiStroke: true })
	g.setAttribute('stroke-linecap', 'round')
	return g
}

/* ── Diagrams ──────────────────────────────────────────────────────────────
   A diagram is laid out and rendered to clean SVG at build time by
   beautiful-mermaid (lib/diagram.ts). This redraws that SVG in place: every
   node shape and every connector is replaced with a rough.js one, and the text
   is left exactly where the layout engine put it.

   Redrawing the output beats reaching for the layout data. beautiful-mermaid
   seals its internals behind an `exports` map, and the SVG it emits is fully
   semantic anyway - `<g class="node" data-shape>` and `<polyline class="edge"
   points>` - so everything needed is right there in the markup. It also means
   the untouched SVG is the no-JS fallback for free: a real diagram, not a hole.

   This is where a whiteboard earns the runtime: CSS cannot draw a connector
   between two boxes at all, and an arrowhead that looks drawn by a person is
   two short strokes at a slight disagreement about the angle. */

const ARROW = 11

/** Excalidraw's palette, cycled so adjacent nodes never share a fill. */
const NODE_FILLS = ['--ex-fill-blue', '--ex-fill-green', '--ex-fill-yellow', '--ex-fill-red']

function pointsOf(el: Element): [number, number][] {
	return (el.getAttribute('points') ?? '')
		.trim()
		.split(/\s+/)
		.map(pair => pair.split(',').map(Number) as [number, number])
		.filter(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
}

/**
 * Two strokes at the tip, at slightly different angles. A single symmetric
 * chevron is the thing that gives a "hand-drawn" diagram away instantly - a
 * person's two strokes never quite agree, and the head is never quite closed.
 */
function arrowhead(
	rc: RoughSVG,
	from: [number, number],
	to: [number, number],
	o: Options,
): SVGGElement {
	const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
	const g = document.createElementNS(SVGNS, 'g')
	for (const [i, spread] of [0.42, -0.36].entries()) {
		const a = angle + Math.PI + spread
		const len = ARROW * (i === 0 ? 1 : 0.88)
		g.appendChild(
			rc.line(to[0], to[1], to[0] + Math.cos(a) * len, to[1] + Math.sin(a) * len, {
				...o,
				seed: (o.seed ?? 1) + i * 613,
				roughness: 0.8,
				bowing: 0.5,
				disableMultiStroke: true,
			}),
		)
	}
	g.setAttribute('stroke-linecap', 'round')
	return g
}

const num = (el: Element, name: string): number => Number(el.getAttribute(name) ?? 0)

/**
 * Redraw one generated SVG primitive as its rough.js equivalent, honouring the
 * `stroke`/`fill` the generator put on it.
 *
 * That last part is the whole point. A cylinder is not one shape: it is a body
 * rect carrying `stroke="none"`, two side lines, and two cap ellipses. Ignoring
 * `stroke="none"` drew an outline round the body as well - a full rounded
 * rectangle, corners and all, stacked underneath the cap ellipses that are
 * supposed to BE its top and bottom. Hence the pile of strokes.
 */
function roughShape(rc: RoughSVG, el: Element, options: Options): SVGGElement | null {
	const stroke = el.getAttribute('stroke')
	const strokeless = stroke === 'none'
	const o: Options = strokeless ? { ...options, stroke: 'none' } : options

	switch (el.tagName.toLowerCase()) {
		case 'rect': {
			const w = num(el, 'width')
			const h = num(el, 'height')
			const x = num(el, 'x')
			const y = num(el, 'y')
			// A body with no outline of its own is a fill, so it is drawn square:
			// rounding it puts visible corners inside a shape whose real silhouette
			// is drawn by the parts around it.
			if (strokeless) return rc.rectangle(x, y, w, h, o)
			return rc.path(roundRect(x, y, w, h), {
				...o,
				roughness: adjustRoughness(w, h, o.roughness ?? 1),
				preserveVertices: true,
			})
		}
		case 'polygon':
			return rc.polygon(pointsOf(el), o)
		case 'polyline':
			return rc.linearPath(pointsOf(el), { ...o, fill: undefined })
		case 'ellipse':
			return rc.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx') * 2, num(el, 'ry') * 2, o)
		case 'circle':
			return rc.circle(num(el, 'cx'), num(el, 'cy'), num(el, 'r') * 2, o)
		case 'line':
			return rc.line(num(el, 'x1'), num(el, 'y1'), num(el, 'x2'), num(el, 'y2'), {
				...o,
				fill: undefined,
				disableMultiStroke: true,
			})
		case 'path': {
			const d = el.getAttribute('d')
			return d ? rc.path(d, o) : null
		}
		default:
			return null
	}
}

function sketchDiagram(host: HTMLElement, seed: number): void {
	const svg = host.querySelector('svg')
	if (!svg || host.dataset.sketched === 'done') return
	host.dataset.sketched = 'done'

	const rc = new RoughSVG(svg)
	const ink = cssVar('--fg', '#1e1e1e')
	const base: Options = { seed, roughness: 1.1, bowing: 1.4, stroke: ink, strokeWidth: 2 }

	/* Every box was measured for the generator's own metrics and then set in
	   Excalifont, which runs up to 1.088x wider on the same string - so labels
	   were spilling out the side of the boxes drawn around them. 0.92 is the
	   reciprocal of that worst case, measured on this diagram's own longest
	   labels. It goes on the attribute rather than in CSS because `font-size` in
	   CSS resolves `em` against the inherited page size, not against the 13px the
	   layout engine wrote here - so `0.92em` came out BIGGER. */
	for (const text of svg.querySelectorAll('text')) {
		const size = Number(text.getAttribute('font-size'))
		if (size > 0) text.setAttribute('font-size', String(+(size * 0.92).toFixed(2)))
	}

	// Nodes first, so connectors drawn after them cross ON TOP - which is what a
	// person does, arriving at a box that is already on the board.
	for (const [i, node] of [...svg.querySelectorAll('g.node')].entries()) {
		const nodeSeed = seed + i * 7919
		const fill = cssVar(NODE_FILLS[i % NODE_FILLS.length], '#a5d8ff')
		const o: Options = {
			...base,
			seed: nodeSeed,
			fill,
			fillStyle: 'hachure',
			fillWeight: 1,
			hachureGap: 9,
		}

		// EVERY primitive in the group, not just the first. A plain box is one
		// <rect>, but a cylinder is a rect plus two lines plus two ellipses and a
		// hexagon is a polygon - picking one shape left the rest of a composite
		// node sitting there un-roughened next to its sketched half.
		const prims = [...node.children].filter(el => el.tagName.toLowerCase() !== 'text')
		for (const [j, prim] of prims.entries()) {
			// Only the first shape carries the hachure. Filling all five parts of a
			// cylinder means five overlapping scribbles where a person drew one.
			const drawn = roughShape(rc, prim, j === 0 ? o : { ...o, fill: undefined })
			if (!drawn) continue
			// The generated shape goes entirely; the <text> sibling stays exactly
			// where the layout engine put it, because roughening text is unreadable.
			node.insertBefore(drawn, node.firstChild)
			prim.remove()
		}
	}

	for (const [i, edge] of [...svg.querySelectorAll('polyline.edge')].entries()) {
		const pts = pointsOf(edge)
		if (pts.length < 2) continue
		const o: Options = {
			...base,
			seed: seed + i * 3571,
			strokeWidth: 1.8,
			roughness: 1.3,
			bowing: 1.6,
			disableMultiStroke: true,
		}
		const g = document.createElementNS(SVGNS, 'g')
		g.setAttribute('class', 'op-sketch-edge')
		g.appendChild(rc.linearPath(pts, o))
		if (edge.getAttribute('data-arrow-end') === 'true') {
			g.appendChild(arrowhead(rc, pts[pts.length - 2], pts[pts.length - 1], o))
		}
		if (edge.getAttribute('data-arrow-start') === 'true') {
			g.appendChild(arrowhead(rc, pts[1], pts[0], { ...o, seed: (o.seed ?? 1) + 101 }))
		}
		g.setAttribute('stroke-linecap', 'round')
		edge.replaceWith(g)
	}

	// An edge label is a scrap of paper laid over the connector so the line does
	// not read through the words. Opaque, drawn, no hachure.
	for (const [i, label] of [...svg.querySelectorAll('g.edge-label')].entries()) {
		const rect = label.querySelector('rect')
		if (!rect) continue
		const x = Number(rect.getAttribute('x'))
		const y = Number(rect.getAttribute('y'))
		const w = Number(rect.getAttribute('width'))
		const h = Number(rect.getAttribute('height'))
		const drawn = rc.rectangle(x, y, w, h, {
			seed: seed + i * 1237,
			roughness: adjustRoughness(w, h, 1),
			bowing: 1,
			stroke: 'none',
			fill: cssVar('--bg', '#ffffff'),
			fillStyle: 'solid',
		})
		rect.replaceWith(drawn)
	}
}

function vrule(rc: RoughSVG, x: number, y1: number, y2: number, options: Options): SVGGElement {
	const g = rc.line(x, y1, x, y2, { ...options, disableMultiStroke: true })
	g.setAttribute('stroke-linecap', 'round')
	return g
}

export function init(): void {
	const targets: Target[] = []
	for (const spec of SPECS) {
		let index = 0
		for (const el of document.querySelectorAll<HTMLElement>(spec.selector)) {
			targets.push(mount(el, spec, index++))
		}
	}
	const diagrams = [...document.querySelectorAll<HTMLElement>('.op-diagram[data-diagram="sketch"]')]
	if (!targets.length && !diagrams.length) return

	// Only now does the fallback come off, so a browser that never gets here
	// keeps the CSS approximation instead of losing its borders entirely.
	root.dataset.sketch = 'on'

	let queued = false
	const pending = new Set<Target>()
	const flush = () => {
		queued = false
		for (const t of pending) draw(t)
		pending.clear()
	}
	const schedule = (t: Target) => {
		pending.add(t)
		if (queued) return
		queued = true
		requestAnimationFrame(flush)
	}

	const byEl = new Map<Element, Target>(targets.map(t => [t.el, t]))
	const observer = new ResizeObserver(entries => {
		for (const entry of entries) {
			const t = byEl.get(entry.target)
			if (t) schedule(t)
		}
	})

	// Excalifont is 25kB of self-hosted webfont with a small x-height, so every
	// box is a different size before and after it lands. Drawing first would mean
	// drawing everything twice.
	const start = () => {
		for (const t of targets) {
			draw(t, true)
			observer.observe(t.el)
		}
		// Diagrams are drawn once and never redrawn: their geometry comes from a
		// build-time layout in a fixed viewBox, so the SVG scales with the column
		// rather than needing to be laid out again at every width.
		for (const [i, host] of diagrams.entries()) sketchDiagram(host, seedOf(`diagram#${i}`))
	}
	if (document.fonts?.status === 'loaded') start()
	else (document.fonts?.ready ?? Promise.resolve()).then(start)

	// A row opening changes where every row below it starts. The container's own
	// height changes too, but not reliably by enough to trust the observer alone.
	for (const t of targets) {
		if (t.spec.shape !== 'rows') continue
		t.el.addEventListener('toggle', () => requestAnimationFrame(() => draw(t, true)), true)
	}
}
