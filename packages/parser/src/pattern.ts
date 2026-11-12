/**
 * The `pattern=` dialect on an @input field (§4.3.1), and the matcher for it.
 *
 * WHY THIS IS NOT `new RegExp(pattern)`.
 *
 * The pattern is agent-authored, and it runs twice: on the human's device
 * before the stamp, and on the server that receives the stamp (§8.1). Handing
 * it to a backtracking engine hands the agent a way to freeze both: `(a+)+$`
 * against forty `a`s and a `b` takes a JavaScript engine minutes, and an ICU
 * engine on a phone the same. Static "is this pattern dangerous" checks exist
 * (A2UI 1.0 ships four rules), and every one of them is a heuristic with an
 * edge somebody finds later.
 *
 * So the dialect compiles to a Thompson NFA and is simulated state-set by
 * state-set. Matching is linear in the value, whatever the pattern says. There
 * is no pattern this function can be handed that makes it slow, which is a
 * property rather than a hope.
 *
 * The second reason is that a Swift host and a TypeScript host must agree on
 * every verdict. `\d` is ASCII in JavaScript and every Unicode digit in ICU;
 * `$` matches before a trailing newline in ICU and not in JavaScript. One
 * engine, written twice from the same rules and pinned by the same corpus
 * cases, cannot drift that way.
 *
 * TOTAL, like the parser: compilePattern returns a verdict, never throws.
 */

/** A pattern longer than this is refused. A field check is a shape, not a program. */
export const MAX_PATTERN_LENGTH = 256

/** The largest `{n}` / `{n,m}` bound. Counted repeats are expanded into states. */
export const MAX_PATTERN_BOUND = 100

/** The NFA may not grow past this many states, however the bounds multiply. */
const MAX_STATES = 5000

/** A value longer than this never matches. Same cut-off A2UI uses. */
export const MAX_MATCH_LENGTH = 4096

type Range = [number, number]

/** Sorted, merged, inclusive code point ranges. */
type CharSet = Range[]

const MAX_CP = 0x10ffff

function merge(ranges: Range[]): CharSet {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: Range[] = []
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1]
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi)
    else out.push([lo, hi])
  }
  return out
}

/**
 * Everything not in `set`, skipping the surrogate block: no well-formed string
 * holds a lone surrogate, and keeping them out means a Swift string (which
 * cannot hold one either) and a JavaScript string agree on every member.
 */
function complement(set: CharSet): CharSet {
  const out: Range[] = []
  let next = 0
  for (const [lo, hi] of set) {
    if (lo > next) out.push([next, lo - 1])
    next = hi + 1
  }
  if (next <= MAX_CP) out.push([next, MAX_CP])
  const noSurrogates: Range[] = []
  for (const [lo, hi] of out) {
    if (hi < 0xd800 || lo > 0xdfff) noSurrogates.push([lo, hi])
    else {
      if (lo < 0xd800) noSurrogates.push([lo, 0xd7ff])
      if (hi > 0xdfff) noSurrogates.push([0xe000, hi])
    }
  }
  return noSurrogates
}

function has(set: CharSet, cp: number): boolean {
  let lo = 0
  let hi = set.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const r = set[mid] as Range
    if (cp < r[0]) hi = mid - 1
    else if (cp > r[1]) lo = mid + 1
    else return true
  }
  return false
}

/** ASCII only, on purpose: the JavaScript meaning, and the one a form means. */
const DIGIT: CharSet = [[0x30, 0x39]]
const WORD: CharSet = merge([
  [0x30, 0x39],
  [0x41, 0x5a],
  [0x5f, 0x5f],
  [0x61, 0x7a],
])
/** ECMAScript WhiteSpace and LineTerminator. */
const SPACE: CharSet = merge([
  [0x09, 0x0d],
  [0x20, 0x20],
  [0xa0, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
])
/** `.` is every code point but the four line terminators. */
const DOT: CharSet = complement(
  merge([
    [0x0a, 0x0a],
    [0x0d, 0x0d],
    [0x2028, 0x2029],
  ]),
)

const CLASS_ESCAPES: Record<string, CharSet> = {
  d: DIGIT,
  D: complement(DIGIT),
  w: WORD,
  W: complement(WORD),
  s: SPACE,
  S: complement(SPACE),
}

const CONTROL_ESCAPES: Record<string, number> = { t: 0x09, n: 0x0a, v: 0x0b, f: 0x0c, r: 0x0d }

/** What `\x` may escape to itself. The ECMAScript syntax characters, plus `/` and `-`. */
const IDENTITY = new Set('^$\\.*+?()[]{}|/-'.split(''))

/* ── the AST ──────────────────────────────────────────────────────────────── */

type Atom =
  | { t: 'set'; set: CharSet }
  | { t: 'group'; body: Alt }
  | { t: 'start' }
  | { t: 'end' }

interface Term {
  atom: Atom
  min: number
  /** Infinity for an unbounded repeat. */
  max: number
}

/** Branches of a disjunction, each a sequence of terms. */
type Alt = Term[][]

class Refused {
  constructor(readonly why: string) {}
}

/**
 * Recursive descent over the code points of the pattern. Every refusal names
 * the construct, because "invalid pattern" tells an agent nothing it can fix.
 */
class Reader {
  private i = 0
  constructor(private readonly cps: number[]) {}

  private peek(): string {
    const cp = this.cps[this.i]
    return cp === undefined ? '' : String.fromCodePoint(cp)
  }

  private take(): string {
    const c = this.peek()
    this.i++
    return c
  }

  private done(): boolean {
    return this.i >= this.cps.length
  }

  parse(): Alt {
    const alt = this.alternation()
    if (!this.done()) {
      const c = this.peek()
      throw new Refused(c === ')' ? 'a ")" with no "(" before it' : `unexpected "${c}"`)
    }
    return alt
  }

  private alternation(): Alt {
    const branches: Term[][] = [this.sequence()]
    while (this.peek() === '|') {
      this.take()
      branches.push(this.sequence())
    }
    return branches
  }

  private sequence(): Term[] {
    const terms: Term[] = []
    while (!this.done() && this.peek() !== '|' && this.peek() !== ')') {
      const atom = this.atom()
      const term: Term = { atom, min: 1, max: 1 }
      this.quantifier(term)
      terms.push(term)
    }
    return terms
  }

  private quantifier(term: Term): void {
    const c = this.peek()
    let min: number
    let max: number
    if (c === '*') [min, max] = [0, Number.POSITIVE_INFINITY]
    else if (c === '+') [min, max] = [1, Number.POSITIVE_INFINITY]
    else if (c === '?') [min, max] = [0, 1]
    else if (c === '{') {
      const bounds = this.braces()
      if (!bounds) throw new Refused('a "{" that is not a {n}, {n,} or {n,m} repeat; write \\{ for a literal brace')
      ;[min, max] = bounds
    } else return

    if (c !== '{') this.take()
    if (term.atom.t === 'start' || term.atom.t === 'end') throw new Refused('"^" and "$" cannot be repeated')
    term.min = min
    term.max = max
    // A lazy `?` changes which match a backtracking engine finds first. This
    // engine only answers "does the whole value match", so it means nothing
    // here, and it is accepted so an agent's habit does not cost it the check.
    if (this.peek() === '?') this.take()
    const next = this.peek()
    if (next === '*' || next === '+' || next === '?' || next === '{') {
      throw new Refused(`"${next}" repeats a repeat; wrap the first one in (?: ) if that is what you mean`)
    }
  }

  /** `{n}`, `{n,}`, `{n,m}`. Returns null, consuming nothing, when it is not one. */
  private braces(): [number, number] | null {
    const start = this.i
    this.take()
    const digits = (): string => {
      let s = ''
      while (/[0-9]/.test(this.peek())) s += this.take()
      return s
    }
    const lo = digits()
    if (!lo) {
      this.i = start
      return null
    }
    let hi = lo
    if (this.peek() === ',') {
      this.take()
      hi = digits()
    }
    if (this.peek() !== '}') {
      this.i = start
      return null
    }
    this.take()
    const min = Number.parseInt(lo, 10)
    const max = hi === '' ? Number.POSITIVE_INFINITY : Number.parseInt(hi, 10)
    if (min > MAX_PATTERN_BOUND || (Number.isFinite(max) && max > MAX_PATTERN_BOUND)) {
      throw new Refused(`a repeat bound above ${MAX_PATTERN_BOUND}; a field check never needs one`)
    }
    if (min > max) throw new Refused(`{${min},${max}} has a minimum above its maximum`)
    return [min, max]
  }

  private atom(): Atom {
    const c = this.take()
    switch (c) {
      case '.':
        return { t: 'set', set: DOT }
      case '^':
        return { t: 'start' }
      case '$':
        return { t: 'end' }
      case '[':
        return { t: 'set', set: this.cls() }
      case '(':
        return this.group()
      case '\\':
        return { t: 'set', set: this.escape(false) }
      case '*':
      case '+':
      case '?':
        throw new Refused(`"${c}" has nothing before it to repeat`)
      case '{':
        throw new Refused('a "{" with nothing to repeat; write \\{ for a literal brace')
      case '}':
      case ']':
        throw new Refused(`a lone "${c}"; write \\${c} for the literal character`)
      default: {
        const cp = c.codePointAt(0) ?? 0
        return { t: 'set', set: [[cp, cp]] }
      }
    }
  }

  private group(): Atom {
    if (this.peek() === '?') {
      this.take()
      const kind = this.take()
      if (kind !== ':') {
        if (kind === '=' || kind === '!') throw new Refused('lookahead is not in the dialect')
        if (kind === '<') {
          const n = this.peek()
          throw new Refused(n === '=' || n === '!' ? 'lookbehind is not in the dialect' : 'named groups are not in the dialect')
        }
        throw new Refused('inline flags are not in the dialect')
      }
    }
    const body = this.alternation()
    if (this.take() !== ')') throw new Refused('a "(" that is never closed')
    return { t: 'group', body }
  }

  /**
   * One escape. `inClass` matters for exactly one thing: `\b` is a backspace
   * inside a class and a word boundary outside, and neither is in the dialect.
   */
  private escape(inClass: boolean): CharSet {
    const c = this.take()
    if (c === '') throw new Refused('a pattern cannot end in a lone backslash')
    const cls = Object.hasOwn(CLASS_ESCAPES, c) ? CLASS_ESCAPES[c] : undefined
    if (cls) return cls
    const control = Object.hasOwn(CONTROL_ESCAPES, c) ? CONTROL_ESCAPES[c] : undefined
    if (control !== undefined) return [[control, control]]
    if (c === 'b' || c === 'B') {
      throw new Refused(inClass ? '[\\b] is not in the dialect; write \\x08' : 'word boundaries are not in the dialect')
    }
    if (/[1-9]/.test(c) || c === 'k') throw new Refused('backreferences are not in the dialect')
    if (c === 'p' || c === 'P') throw new Refused('Unicode property escapes are not in the dialect')
    if (c === 'c') throw new Refused('control-letter escapes are not in the dialect')
    if (c === '0') {
      if (/[0-9]/.test(this.peek())) throw new Refused('octal escapes are not in the dialect')
      return [[0, 0]]
    }
    if (c === 'x') return this.single(this.hex(2))
    if (c === 'u') {
      if (this.peek() === '{') {
        this.take()
        let s = ''
        while (/[0-9a-fA-F]/.test(this.peek())) s += this.take()
        if (!s || this.take() !== '}') throw new Refused('a \\u{…} escape with no closing brace')
        const cp = Number.parseInt(s, 16)
        if (cp > MAX_CP) throw new Refused(`\\u{${s}} is past the last code point`)
        return this.single(cp)
      }
      return this.single(this.hex(4))
    }
    if (IDENTITY.has(c)) {
      const cp = c.codePointAt(0) ?? 0
      return [[cp, cp]]
    }
    throw new Refused(`"\\${c}" is not an escape in the dialect`)
  }

  private single(cp: number): CharSet {
    return [[cp, cp]]
  }

  private hex(n: number): number {
    let s = ''
    for (let k = 0; k < n; k++) {
      const c = this.take()
      if (!/[0-9a-fA-F]/.test(c)) throw new Refused(`a \\${n === 2 ? 'x' : 'u'} escape needs ${n} hex digits`)
      s += c
    }
    return Number.parseInt(s, 16)
  }

  /** `[` has been consumed. Reads to the matching `]`. */
  private cls(): CharSet {
    let negated = false
    if (this.peek() === '^') {
      this.take()
      negated = true
    }
    const ranges: Range[] = []
    let first = true
    while (true) {
      if (this.done()) throw new Refused('a "[" that is never closed')
      if (this.peek() === ']' && !first) {
        this.take()
        break
      }
      if (this.peek() === ']') throw new Refused('an empty class "[]" matches nothing')
      first = false
      const lo = this.classAtom()
      // A `-` is a range only BETWEEN two single characters. At the edges it is
      // a literal hyphen, which is how everyone writes `[a-z-]`.
      if (this.peek() === '-' && this.cps[this.i + 1] !== undefined && String.fromCodePoint(this.cps[this.i + 1] as number) !== ']') {
        this.take()
        const hi = this.classAtom()
        if (lo.length !== 1 || hi.length !== 1 || lo[0]?.[0] !== lo[0]?.[1] || hi[0]?.[0] !== hi[0]?.[1]) {
          throw new Refused('a range like [\\d-z] needs a single character at each end')
        }
        const a = lo[0]?.[0] ?? 0
        const b = hi[0]?.[0] ?? 0
        if (a > b) throw new Refused('a class range runs backwards')
        ranges.push([a, b])
        continue
      }
      ranges.push(...lo)
    }
    const set = merge(ranges)
    return negated ? complement(set) : set
  }

  private classAtom(): CharSet {
    const c = this.take()
    if (c === '\\') return this.escape(true)
    const cp = c.codePointAt(0) ?? 0
    return [[cp, cp]]
  }
}

/* ── the NFA ──────────────────────────────────────────────────────────────── */

type State =
  | { k: 'set'; set: CharSet; out: number }
  | { k: 'split'; a: number; b: number }
  | { k: 'start'; out: number }
  | { k: 'end'; out: number }
  | { k: 'match' }

/** A compiled fragment: where it begins, and the dangling exits still to patch. */
interface Frag {
  start: number
  /** Each exit is [stateIndex, slot] where slot names which edge to patch. */
  outs: Array<[number, 'out' | 'a' | 'b']>
}

class Builder {
  readonly states: State[] = []

  private add(s: State): number {
    if (this.states.length >= MAX_STATES) throw new Refused('the pattern expands past what a field check may hold; lower its repeat bounds')
    this.states.push(s)
    return this.states.length - 1
  }

  patch(outs: Frag['outs'], to: number): void {
    for (const [i, slot] of outs) {
      const s = this.states[i] as Record<string, unknown>
      s[slot] = to
    }
  }

  /** An epsilon pass-through, used for an empty branch or a `{0}` repeat. */
  private empty(): Frag {
    const i = this.add({ k: 'split', a: -1, b: -1 })
    // Both edges go to the same place: whatever this fragment is patched to.
    return { start: i, outs: [[i, 'a'], [i, 'b']] }
  }

  alt(alt: Alt): Frag {
    const frags = alt.map(seq => this.seq(seq))
    let acc = frags[0] ?? this.empty()
    for (let k = 1; k < frags.length; k++) {
      const next = frags[k] as Frag
      const s = this.add({ k: 'split', a: acc.start, b: next.start })
      acc = { start: s, outs: [...acc.outs, ...next.outs] }
    }
    return acc
  }

  private seq(terms: Term[]): Frag {
    if (!terms.length) return this.empty()
    let acc: Frag | null = null
    for (const t of terms) {
      const f = this.term(t)
      if (acc) {
        this.patch(acc.outs, f.start)
        acc = { start: acc.start, outs: f.outs }
      } else acc = f
    }
    return acc as Frag
  }

  private atom(a: Atom): Frag {
    if (a.t === 'group') return this.alt(a.body)
    if (a.t === 'set') {
      const i = this.add({ k: 'set', set: a.set, out: -1 })
      return { start: i, outs: [[i, 'out']] }
    }
    const i = this.add({ k: a.t, out: -1 })
    return { start: i, outs: [[i, 'out']] }
  }

  private star(t: Term): Frag {
    const s = this.add({ k: 'split', a: -1, b: -1 })
    const body = this.atom(t.atom)
    ;(this.states[s] as { a: number }).a = body.start
    this.patch(body.outs, s)
    return { start: s, outs: [[s, 'b']] }
  }

  private optional(t: Term): Frag {
    const body = this.atom(t.atom)
    const s = this.add({ k: 'split', a: body.start, b: -1 })
    return { start: s, outs: [...body.outs, [s, 'b']] }
  }

  /**
   * `x{n,m}` is n copies of x, then m-n optional ones. Each copy compiles the
   * atom afresh, so a group's states are never shared between iterations.
   */
  private term(t: Term): Frag {
    if (t.min === 1 && t.max === 1) return this.atom(t.atom)
    const parts: Frag[] = []
    for (let k = 0; k < t.min; k++) parts.push(this.atom(t.atom))
    if (!Number.isFinite(t.max)) parts.push(this.star(t))
    else for (let k = t.min; k < t.max; k++) parts.push(this.optional(t))
    if (!parts.length) return this.empty()
    let acc = parts[0] as Frag
    for (let k = 1; k < parts.length; k++) {
      const next = parts[k] as Frag
      this.patch(acc.outs, next.start)
      acc = { start: acc.start, outs: next.outs }
    }
    return acc
  }
}

/** A pattern that passed the dialect, ready to match. Opaque on purpose. */
export interface Pattern {
  readonly source: string
  readonly states: readonly State[]
  readonly start: number
}

export type PatternVerdict = { ok: true; pattern: Pattern } | { ok: false; why: string }

function codePoints(s: string): number[] {
  const out: number[] = []
  for (const ch of s) out.push(ch.codePointAt(0) ?? 0)
  return out
}

/**
 * Parse and compile. A refusal says what, never just "invalid", because the
 * warning is the only way the agent that wrote it learns how to fix it.
 */
export function compilePattern(source: string): PatternVerdict {
  const cps = codePoints(String(source ?? ''))
  if (!cps.length) return { ok: false, why: 'an empty pattern checks nothing' }
  if (cps.length > MAX_PATTERN_LENGTH) {
    return { ok: false, why: `${cps.length} characters is past the ${MAX_PATTERN_LENGTH} a pattern may have` }
  }
  try {
    const ast = new Reader(cps).parse()
    const b = new Builder()
    const frag = b.alt(ast)
    const match = b.states.length
    b.states.push({ k: 'match' })
    b.patch(frag.outs, match)
    return { ok: true, pattern: { source, states: b.states, start: frag.start } }
  } catch (err) {
    if (err instanceof Refused) return { ok: false, why: err.why }
    // Unreachable by construction. A totality contract does not get to rely on that.
    return { ok: false, why: 'the pattern could not be read' }
  }
}

/** Follow every epsilon edge from `i` at `pos`, collecting the states that read. */
function closure(states: readonly State[], i: number, pos: number, len: number, into: Set<number>, seen: Set<number>): void {
  const stack = [i]
  while (stack.length) {
    const s = stack.pop() as number
    if (s < 0 || seen.has(s)) continue
    seen.add(s)
    const st = states[s] as State
    switch (st.k) {
      case 'split':
        stack.push(st.b, st.a)
        break
      case 'start':
        if (pos === 0) stack.push(st.out)
        break
      case 'end':
        if (pos === len) stack.push(st.out)
        break
      default:
        into.add(s)
    }
  }
}

/**
 * Does the WHOLE value match? A field check is a shape the entire value must
 * have -- `\d{10}` means ten digits, not "ten digits somewhere in there" --
 * so the pattern is anchored at both ends whether or not it says `^` and `$`.
 */
export function matchPattern(p: Pattern, value: string): boolean {
  const cps = codePoints(value)
  if (cps.length > MAX_MATCH_LENGTH) return false
  const { states } = p
  let current = new Set<number>()
  closure(states, p.start, 0, cps.length, current, new Set())
  for (let pos = 0; pos < cps.length; pos++) {
    const cp = cps[pos] as number
    const next = new Set<number>()
    const seen = new Set<number>()
    for (const s of current) {
      const st = states[s] as State
      if (st.k === 'set' && has(st.set, cp)) closure(states, st.out, pos + 1, cps.length, next, seen)
    }
    if (!next.size) return false
    current = next
  }
  for (const s of current) if ((states[s] as State).k === 'match') return true
  return false
}
