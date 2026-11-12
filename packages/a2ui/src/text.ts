/**
 * Agent text going into an A2UI `Text`. The basic catalog renders simple
 * markdown, so a prompt like `*not* a heading` or `# 1` would be reformatted
 * by the renderer into something the agent never wrote. Every character
 * CommonMark could read as syntax is backslash-escaped, and a line that would
 * start a list is defused. A `@note` body is markdown by design and is NOT
 * passed through here.
 */
export function md(s: string): string {
  return s.replace(/[\\`*_[\]<>#!~|]/g, '\\$&').replace(/^(\s*)([-+]|\d+[.)])(?=\s|$)/gm, '$1\\$2')
}

/** One JSON Pointer segment (RFC 6901): `~` and `/` are the only escapes. */
export function ptr(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}
