/**
 * @anvil-md/conformance -- the language-level test suite.
 *
 * `corpus.json` is the artefact. It is plain JSON with no TypeScript in it, so
 * an implementation in Go, Rust, Python or anything else can read the same
 * cases and run the same assertions; this file is only the reference runner.
 *
 * The corpus tests the LANGUAGE, not this codebase. Where an expectation names
 * HTML it names a substring the spec requires to be observable -- `data-sent`,
 * `+2 more`, an escaped script tag -- never a class name that happens to exist
 * in @anvil-md/render-html. A renderer with different class names should still
 * pass everything under `blocks`, `tree` and `warnings`; the `html*` keys are
 * for renderers that follow §9 and the reference stylesheet.
 */
import corpus from '../corpus.json' with { type: 'json' }

export interface BlockExpectation {
  kind?: string
  id?: string
  derivedId?: boolean
  prompt?: string
  subtext?: string
  optionValues?: string[]
  optionLabels?: string[]
  /**
   * The row `recommend=` marks (§4.1.1). `""` means NOTHING is marked -- an
   * empty string rather than `null` because a null and an absent key decode
   * the same in more than one language, and "absent" means "not asserted".
   */
  recommended?: string
  taskStates?: string[]
  taskRefs?: string[]
  taskLabels?: string[]
  taskMeta?: string[]
  taskDetails?: string[]
  /** `null` in a slot means that row must NOT have rolled up. */
  taskRollups?: (string | null)[]
  meta?: string[][]
  progress?: { done?: number; total?: number; pct?: number; rollup?: boolean }
  /** @chart rows. `dataRaw` is the text the value was parsed out of (§4.16.1). */
  dataLabels?: string[]
  dataValues?: number[]
  dataRaw?: string[]
  /**
   * Each row's change from `was=`, COMPUTED (§4.16.5). `null` for a row with no
   * `was=`; `pct` is `null` when `was` is zero.
   */
  dataDeltas?: ({ diff: number; pct: number | null; tone: string } | null)[]
  /** The range the bars are drawn against, after §4.16.2 has had its say. */
  domain?: { floor?: number; top?: number; zeroPct?: number; authoredTop?: boolean }
  /** @flow nodes AFTER implied ones are resolved, in rank order. */
  nodeIds?: string[]
  nodeStates?: string[]
  /** Ranks as id lists, so a layering rule can be pinned without pixels. */
  ranks?: string[][]
  /** Every edge as `from>to`, in source order. */
  edges?: string[]
  /** The subset of `edges` the layout had to lift out of ranking (§4.17.3). */
  backEdges?: string[]
}

export interface TreeExpectation {
  kind: string
  /** Child ids, in order. */
  children: string[]
}

export interface CaseExpectation {
  /** Positional, top level only. Containers are checked with `tree`. */
  blocks?: BlockExpectation[]
  topLevelKinds?: string[]
  tree?: TreeExpectation[]
  /** Deepest container nesting the parser is allowed to produce. */
  maxDepth?: number
  /** Exact: every block's warnings, flattened, must be empty. */
  warnings?: string[]
  /** Each entry must appear as a substring of some warning somewhere. */
  warningsContain?: string[]
  htmlContains?: string[]
  htmlExcludes?: string[]
  htmlCount?: Record<string, number>
  /** For cases whose only requirement is that nothing explodes. */
  neverThrows?: boolean
}

export interface ConformanceCase {
  id: string
  /** The SPEC.md section this case pins. */
  spec: string
  title: string
  source: string
  /** Parse with `partial: true`, i.e. the fence is still arriving. */
  partial?: boolean
  expect: CaseExpectation
  /** A second source that must derive the same id as this one. */
  sameDerivedIdAs?: string
}

export interface Corpus {
  version: number
  about: string
  cases: ConformanceCase[]
}

export const CORPUS: Corpus = corpus as Corpus

export function cases(): ConformanceCase[] {
  return CORPUS.cases
}

/** Every distinct spec section the corpus pins, in document order. */
export function coveredSections(): string[] {
  const seen = new Set(CORPUS.cases.map(c => c.spec))
  return [...seen].sort((a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  })
}
