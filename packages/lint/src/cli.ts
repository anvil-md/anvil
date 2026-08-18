#!/usr/bin/env bun
/**
 * anvil-lint -- the command line front end.
 *
 *   anvil-lint README.md docs/*.md     lint every ```anvil fence found
 *   anvil-lint --raw block.anvil       the file IS one fence
 *   cat x.md | anvil-lint              stdin
 *   anvil-lint --json ...              machine-readable, for CI
 *   anvil-lint --off grid-of-one ...   turn a rule off
 *   anvil-lint --rules                 what it checks, and why
 *
 * Exit 1 when anything at `error` severity is found, 0 otherwise. `--strict`
 * promotes warnings to the exit code too.
 */
import { lint, lintMarkdown, RULES, type Severity } from './index'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'

const TINT: Record<Severity, string> = { error: RED, warn: YELLOW, info: BLUE }

/** Colour only when someone is watching; a pipe gets clean text. */
const colour = process.stdout.isTTY === true && process.env.NO_COLOR === undefined
const c = (code: string, s: string): string => (colour ? `${code}${s}${RESET}` : s)

interface Args {
  files: string[]
  json: boolean
  raw: boolean
  strict: boolean
  quiet: boolean
  rules: boolean
  off: string[]
}

function parseArgs(argv: string[]): Args {
  const a: Args = { files: [], json: false, raw: false, strict: false, quiet: false, rules: false, off: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    if (arg === '--json') a.json = true
    else if (arg === '--raw') a.raw = true
    else if (arg === '--strict') a.strict = true
    else if (arg === '--quiet' || arg === '-q') a.quiet = true
    else if (arg === '--rules') a.rules = true
    else if (arg === '--off') a.off.push(...(argv[++i] ?? '').split(',').filter(Boolean))
    else if (arg === '--help' || arg === '-h') a.rules = true
    else a.files.push(arg)
  }
  return a
}

function printRules(): void {
  const width = Math.max(...RULES.map(r => r.id.length))
  process.stdout.write(`${c(BOLD, 'anvil-lint')} ${DIM}${RULES.length} rules${RESET}\n\n`)
  for (const r of RULES) {
    const sev = c(TINT[r.severity], r.severity.padEnd(5))
    process.stdout.write(`  ${sev}  ${r.id.padEnd(width)}  ${r.about} ${c(DIM, `§${r.spec}`)}\n`)
  }
  process.stdout.write(`\n  ${c(DIM, 'plus')} warn   parse-warning${' '.repeat(Math.max(0, width - 13))}  Everything the parser already complained about. §11\n`)
}

async function read(file: string): Promise<string> {
  if (file === '-') return await Bun.stdin.text()
  return await Bun.file(file).text()
}

const args = parseArgs(process.argv.slice(2))

if (args.rules) {
  printRules()
  process.exit(0)
}

const files = args.files.length ? args.files : ['-']
const reports: ReturnType<typeof lintMarkdown>[] = []

for (const file of files) {
  let text: string
  try {
    text = await read(file)
  } catch {
    process.stderr.write(`${c(RED, 'cannot read')} ${file}\n`)
    process.exitCode = 1
    continue
  }

  // `--raw` treats the whole file as one fence, which is what a `.anvil` file
  // is. Without it the file is markdown and only its anvil fences are linted.
  reports.push(
    args.raw
      ? { file, fences: [{ line: 1, result: lint(text, { off: args.off }) }], counts: { error: 0, warn: 0, info: 0 }, ok: true }
      : lintMarkdown(text, file, { off: args.off }),
  )
}

// --raw skips the aggregate, so recompute uniformly rather than trusting it.
for (const r of reports) {
  const all = r.fences.flatMap(f => f.result.diagnostics)
  r.counts = { error: 0, warn: 0, info: 0 }
  for (const d of all) r.counts[d.severity]++
  r.ok = r.counts.error === 0
}

if (args.json) {
  process.stdout.write(`${JSON.stringify({ reports }, null, 2)}\n`)
} else {
  for (const r of reports) {
    for (const f of r.fences) {
      for (const d of f.result.diagnostics) {
        if (args.quiet && d.severity === 'info') continue
        const where = `${r.file}:${f.line}`
        const who = d.block ? `@${d.kind} ${d.block}` : `@${d.kind}`
        process.stdout.write(
          `${c(DIM, where)}  ${c(TINT[d.severity], d.severity.padEnd(5))}  ${c(BOLD, who)}  ${d.message}  ${c(DIM, `${d.rule} §${d.spec}`)}\n`,
        )
      }
    }
  }

  const total = reports.reduce(
    (acc, r) => ({ error: acc.error + r.counts.error, warn: acc.warn + r.counts.warn, info: acc.info + r.counts.info }),
    { error: 0, warn: 0, info: 0 },
  )
  const fenceCount = reports.reduce((n, r) => n + r.fences.length, 0)
  const parts = [`${fenceCount} fence${fenceCount === 1 ? '' : 's'}`]
  for (const s of ['error', 'warn', 'info'] as const) {
    if (total[s]) parts.push(c(TINT[s], `${total[s]} ${s}${total[s] === 1 ? '' : 's'}`))
  }
  if (!total.error && !total.warn && !total.info) parts.push(c(DIM, 'clean'))
  process.stdout.write(`\n${parts.join('  ·  ')}\n`)
}

const failed = reports.some(r => !r.ok || (args.strict && r.counts.warn > 0))
if (failed) process.exitCode = 1
