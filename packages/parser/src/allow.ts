/**
 * The §8.3 allowlists. `swatch`, `font` and `img` come from agent-authored
 * text and land where escaping alone is not enough -- a style attribute, an
 * image source, another protocol's URL field. They are ALLOWLISTED, not
 * sanitised: a value that fails is dropped rather than escaped.
 *
 * Here rather than in a renderer because every surface that draws a row needs
 * the same answer: the HTML renderer, the A2UI export, and a native host
 * checking a live row a function returned (§4.1.2).
 */

/** Hex only. Anything else is dropped rather than escaped into a style attr. */
export function safeColor(c: string): string | null {
  return /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : null
}

/** Conservative family name: letters, digits, spaces, dashes. No quotes, no url(). */
export function safeFont(f: string): string | null {
  const t = f.trim().replace(/^["']|["']$/g, '')
  return /^[\w][\w -]{0,48}$/.test(t) ? t : null
}

/** http(s) and nothing that could close the attribute it lands in. */
export function safeUrl(u: string): string | null {
  const t = u.trim()
  return /^https?:\/\/[^\s"'<>]+$/i.test(t) ? t : null
}
