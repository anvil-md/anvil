/**
 * The examples page's own host, with one face registered: `lead`.
 *
 * This is what §4.12.5 looks like from the host's side. The face is a plain
 * function from the parsed block to an HTML string; the renderer draws the frame
 * around it and checks that nothing the parser read went missing. Everything a
 * product would put in a real one -- a CRM link, a score colour, an avatar --
 * lives here, in the host, and none of it reaches the language.
 */
import type { AnvilHost, CardFace } from '@anvil-md/render-html'

/** Two letters from the name, for the mark. Decoration, not data: it counts nothing. */
function initials(name: string): string {
	const words = name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w))
	return words
		.slice(0, 2)
		.map(w => w.charAt(0).toUpperCase())
		.join('')
}

const lead: CardFace = (b, { esc }) => {
	const chips = b.meta.flat().map(c => c.replace(/^!\s*/, ''))
	const why = b.prose
		.split('\n')
		.filter(Boolean)
		.map(l => `<p class="lead-why">${esc(l)}</p>`)
		.join('')
	return `<div class="lead-face">
		<span class="lead-mark" aria-hidden="true">${esc(initials(b.subtext || b.prompt))}</span>
		<div class="lead-main">
			<p class="lead-chips">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</p>
			${why}
		</div>
	</div>`
}

export const DEMO_HOST: AnvilHost = { faces: { lead } }
