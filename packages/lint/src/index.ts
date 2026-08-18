/**
 * @anvil-md/lint -- a validator for ANVIL source.
 *
 * Two halves. Every parse warning becomes a diagnostic, so lint is a strict
 * superset of what the parser already tells you; then the rules in rules.ts add
 * everything a TOTAL, single-pass parser structurally cannot say -- anything
 * that needs to see two blocks at once, or a whole document.
 *
 * Nothing here throws. Same reason as the parser: this runs over agent-authored
 * text, and a linter that dies on bad input is the least useful kind.
 */
import { type AnvilBlock, type AnvilDoc, parseAnvil } from '@anvil-md/parser'
import { type Diagnostic, RULES, type Rule, type Severity } from './rules'

export type { Diagnostic, Rule, Severity } from './rules'
export { RULES, RULE_IDS } from './rules'

export interface LintOptions {
  /** Rule ids to skip. Unknown ids are ignored rather than an error. */
  off?: string[]
  /** Skip the parser's own warnings and report rule findings only. */
  skipParseWarnings?: boolean
}

export interface LintResult {
  diagnostics: Diagnostic[]
  counts: Record<Severity, number>
  /** True when nothing at `error` severity was found. */
  ok: boolean
}

/** Depth-first, containers included: a rule must see blocks inside a @grid. */
export function flatten(doc: AnvilDoc): AnvilBlock[] {
  const out: AnvilBlock[] = []
  const walk = (bs: AnvilBlock[]): void => {
    for (const b of bs) {
      out.push(b)
      walk(b.children)
    }
  }
  walk(doc.blocks)
  return out
}

const PARSE_RULE = 'parse-warning'

function tally(diagnostics: Diagnostic[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
  for (const d of diagnostics) counts[d.severity]++
  return counts
}

const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

export function lintDoc(doc: AnvilDoc, opts: LintOptions = {}): LintResult {
  const off = new Set(opts.off ?? [])
  const blocks = flatten(doc)
  const diagnostics: Diagnostic[] = []

  if (!opts.skipParseWarnings && !off.has(PARSE_RULE)) {
    for (const b of blocks) {
      for (const message of b.warnings) {
        diagnostics.push({ rule: PARSE_RULE, severity: 'warn', block: b.id, kind: b.kind, message, spec: '11' })
      }
    }
  }

  for (const rule of RULES) {
    if (off.has(rule.id)) continue
    const report = (b: AnvilBlock | null, message: string): void => {
      diagnostics.push({
        rule: rule.id,
        severity: rule.severity,
        block: b?.id ?? '',
        kind: b?.kind ?? 'document',
        message,
        spec: rule.spec,
      })
    }
    // A broken rule must not take the linter down with it.
    try {
      rule.run(blocks, report)
    } catch (err) {
      diagnostics.push({
        rule: rule.id,
        severity: 'warn',
        block: '',
        kind: 'document',
        message: `rule threw: ${err instanceof Error ? err.message : 'unknown'}`,
        spec: rule.spec,
      })
    }
  }

  diagnostics.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.rule.localeCompare(b.rule))
  const counts = tally(diagnostics)
  return { diagnostics, counts, ok: counts.error === 0 }
}

/** Lint one fence's worth of ANVIL source. */
export function lint(source: string, opts: LintOptions = {}): LintResult {
  return lintDoc(parseAnvil(source), opts)
}

export interface Fence {
  /** 1-based line of the opening fence, for a clickable `file:line`. */
  line: number
  source: string
  /** Anything after ```anvil on the opening line. */
  info: string
}

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*anvil\b(.*)$/

/**
 * Pull every ```anvil fence out of a markdown document.
 *
 * Tracks the opening delimiter so a fence closes only on a run of the same
 * character that is at least as long, which is how an ANVIL fence containing a
 * ~~~ literal (§4.4) stays in one piece.
 */
export function fences(markdown: string): Fence[] {
  const lines = String(markdown ?? '').split('\n')
  const out: Fence[] = []

  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i] ?? '')
    if (!open) continue
    const delim = open[2] ?? '```'
    const close = new RegExp(`^\\s*${delim[0] === '`' ? '`' : '~'}{${delim.length},}\\s*$`)
    const body: string[] = []
    const start = i + 1
    i++
    while (i < lines.length && !close.test(lines[i] ?? '')) {
      body.push(lines[i] ?? '')
      i++
    }
    out.push({ line: start, source: body.join('\n'), info: (open[3] ?? '').trim() })
  }
  return out
}

export interface FileReport {
  file: string
  fences: { line: number; result: LintResult }[]
  counts: Record<Severity, number>
  ok: boolean
}

/** Lint every ANVIL fence in a markdown document. */
export function lintMarkdown(markdown: string, file = '<stdin>', opts: LintOptions = {}): FileReport {
  const found = fences(markdown).map(f => ({ line: f.line, result: lint(f.source, opts) }))
  const all = found.flatMap(f => f.result.diagnostics)
  const counts = tally(all)
  return { file, fences: found, counts, ok: counts.error === 0 }
}
