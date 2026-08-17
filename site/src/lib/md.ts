/**
 * Markdown-lite. Deliberately tiny: the content author is an agent writing a
 * single TypeScript file, not a CMS. Raw HTML passes through untouched.
 */
export function md(input: string): string {
	return input
		.replace(
			/\[([^\]]+)\]\(([^)\s]+)\)/g,
			'<a href="$2" class="underline decoration-accent/50 underline-offset-4 transition-colors hover:decoration-accent">$1</a>',
		)
		.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-fg">$1</strong>')
		.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
		.replace(
			/`([^`]+)`/g,
			'<code class="rounded bg-fg/[0.07] px-1.5 py-0.5 font-mono text-[0.9em]">$1</code>',
		)
}
