/**
 * Every ASCII picture in SPEC.md must render one glyph per monospace cell.
 *
 * The site set IBM Plex Mono from fontsource, which ships Google's subsets, and
 * none of them carries Box Drawing. Every `─│┌` fell through to SF Mono or Menlo
 * at a slightly different advance, so a row of 72 `─` and a row of 70 letters
 * between two `│` came out different widths. The characters were counted right
 * and every box on the site still had a crooked right edge.
 *
 * So this resolves each non-ASCII character in a SPEC.md code fence the way the
 * browser does -- through the `IBM Plex Mono` @font-face rules the site actually
 * declares, latest rule first, skipping a face whose font lacks the glyph -- and
 * reads the advance out of that font's `hmtx`. A character no declared face
 * draws, or one drawn at anything but 600/1000 em, fails here instead of on the
 * page. The fix for a failure is a face in site/src/styles/global.css, or a
 * different character in the picture.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'

const ROOT = new URL('..', import.meta.url).pathname
const SITE_CSS = join(ROOT, 'site/src/styles/global.css')
const PLEX_ADVANCE = 0.6

interface Face {
  file: string
  ranges: [number, number][]
}

/** `U+2500-259F, U+25CA` as inclusive code point pairs. */
function parseRanges(value: string): [number, number][] {
  return value.split(',').map((part) => {
    const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-')
    return [Number.parseInt(lo, 16), Number.parseInt(hi, 16)]
  })
}

/** The regular-weight `IBM Plex Mono` faces in one stylesheet, in declaration order. */
function facesIn(cssFile: string): Face[] {
  const css = readFileSync(cssFile, 'utf8')
  const faces: Face[] = []
  for (const [, body] of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    if (!/font-family:\s*['"]?IBM Plex Mono['"]?\s*;/.test(body)) continue
    if (/font-style:\s*italic/.test(body)) continue
    const weight = body.match(/font-weight:\s*(\d+)(?:\s+(\d+))?/)
    if (weight && !(Number(weight[1]) <= 400 && 400 <= Number(weight[2] ?? weight[1]))) continue
    const url = body.match(/url\(["']?([^"')]+\.woff2)["']?\)/)?.[1]
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1]
    if (!url || !range) continue
    faces.push({ file: join(dirname(cssFile), url), ranges: parseRanges(range) })
  }
  return faces
}

/** Code point -> advance in em, for one woff2. Only cmap, head, hhea and hmtx are read. */
function readWoff2(file: string): Map<number, number> {
  const buf = readFileSync(file)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(0) !== 0x774f4632) throw new Error(`${file} is not woff2`)
  const numTables = dv.getUint16(12)
  // glyf and loca have to be named even though they are never read: their
  // transform rule is inverted, and misreading it shifts every table after them.
  const known: Record<number, string> = { 0: 'cmap', 1: 'head', 2: 'hhea', 3: 'hmtx', 10: 'glyf', 11: 'loca' }
  let p = 48
  const base128 = () => {
    let n = 0
    for (let i = 0; i < 5; i++) {
      const b = dv.getUint8(p++)
      n = n * 128 + (b & 0x7f)
      if (!(b & 0x80)) return n
    }
    throw new Error('bad UIntBase128')
  }
  const tables = new Map<string, { offset: number; length: number; transformed: boolean }>()
  let offset = 0
  for (let i = 0; i < numTables; i++) {
    const flags = dv.getUint8(p++)
    let tag = known[flags & 0x3f] ?? `#${flags & 0x3f}`
    if ((flags & 0x3f) === 0x3f) {
      tag = String.fromCharCode(...buf.subarray(p, p + 4))
      p += 4
    }
    const origLength = base128()
    const version = flags >> 6
    // glyf/loca are transformed at version 0; every other table at non-zero.
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0
    const length = transformed ? base128() : origLength
    tables.set(tag, { offset, length, transformed })
    offset += length
  }
  const data = brotliDecompressSync(buf.subarray(p, p + dv.getUint32(20)))
  const t = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const at = (tag: string) => {
    const entry = tables.get(tag)
    if (!entry) throw new Error(`${file} has no ${tag}`)
    return entry
  }

  const unitsPerEm = t.getUint16(at('head').offset + 18)
  const numberOfHMetrics = t.getUint16(at('hhea').offset + 34)
  const hmtx = at('hmtx')
  // A transformed hmtx leads with a flags byte and packs advances contiguously.
  const advanceOf = (gid: number) => {
    const g = Math.min(gid, numberOfHMetrics - 1)
    return hmtx.transformed ? t.getUint16(hmtx.offset + 1 + g * 2) : t.getUint16(hmtx.offset + g * 4)
  }

  const cmap = at('cmap').offset
  const out = new Map<number, number>()
  let best: { format: number; at: number } | undefined
  for (let i = 0; i < t.getUint16(cmap + 2); i++) {
    const rec = cmap + 4 + i * 8
    const sub = cmap + t.getUint32(rec + 4)
    const format = t.getUint16(sub)
    if (format === 12 || (format === 4 && best?.format !== 12)) best = { format, at: sub }
  }
  if (!best) throw new Error(`${file} has no format 4/12 cmap`)
  const add = (cp: number, gid: number) => {
    if (gid) out.set(cp, advanceOf(gid) / unitsPerEm)
  }
  if (best.format === 12) {
    const groups = t.getUint32(best.at + 12)
    for (let i = 0; i < groups; i++) {
      const g = best.at + 16 + i * 12
      const start = t.getUint32(g)
      for (let cp = start; cp <= t.getUint32(g + 4); cp++) add(cp, t.getUint32(g + 8) + cp - start)
    }
  } else {
    const segX2 = t.getUint16(best.at + 6)
    const ends = best.at + 14
    const starts = ends + segX2 + 2
    const deltas = starts + segX2
    const rangeOffsets = deltas + segX2
    for (let s = 0; s < segX2; s += 2) {
      const start = t.getUint16(starts + s)
      const end = t.getUint16(ends + s)
      const delta = t.getInt16(deltas + s)
      const ro = t.getUint16(rangeOffsets + s)
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let gid = ro ? t.getUint16(rangeOffsets + s + ro + (cp - start) * 2) : cp
        if (gid) gid = (gid + delta) & 0xffff
        add(cp, gid)
      }
    }
  }
  return out
}

const fontsourceCss = Bun.resolveSync('@fontsource/ibm-plex-mono/400.css', join(ROOT, 'site'))
// @import rules are hoisted, so the fontsource faces are declared before ours.
const FONTSOURCE = facesIn(fontsourceCss)
const DECLARED = [...FONTSOURCE, ...facesIn(SITE_CSS)]
const glyphs = new Map<string, Map<number, number>>()
const cmapOf = (face: Face) => glyphs.get(face.file) ?? glyphs.set(face.file, readWoff2(face.file)).get(face.file)!

/** The face a browser would draw `cp` with, and its advance, or nothing: a system fallback. */
function resolve(cp: number, faces: Face[]): { face: Face; advance: number } | undefined {
  for (const face of [...faces].reverse()) {
    if (!face.ranges.some(([lo, hi]) => lo <= cp && cp <= hi)) continue
    const advance = cmapOf(face).get(cp)
    if (advance !== undefined) return { face, advance }
  }
}

/** Every non-ASCII character inside a SPEC.md code fence, with the line it first appears on. */
function fenceGlyphs(): Map<string, number> {
  const lines = readFileSync(join(ROOT, 'SPEC.md'), 'utf8').split('\n')
  const seen = new Map<string, number>()
  // CommonMark: only a bare run of the opening character, at least as long,
  // closes a fence. SPEC.md:21 opens with ```` and shows an ```anvil fence
  // inside it; a plain toggle flipped there and read the rest of the file inverted.
  let open: string | undefined
  lines.forEach((line, i) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (!open && marker) open = marker[1]
    else if (open && marker && marker[1][0] === open[0] && marker[1].length >= open.length && !marker[2].trim())
      open = undefined
    else if (open) for (const ch of line) if (ch.codePointAt(0)! > 0x7f && !seen.has(ch)) seen.set(ch, i + 1)
  })
  return seen
}

describe('site glyphs', () => {
  test('the fontsource subsets alone do not draw box drawing (why global.css has its own faces)', () => {
    expect(resolve(0x2500, FONTSOURCE)).toBeUndefined()
  })

  test('the stylesheets declare the faces this test resolves through', () => {
    expect(FONTSOURCE.length).toBeGreaterThan(0)
    expect(DECLARED.length).toBeGreaterThan(FONTSOURCE.length)
  })

  const chars = [...fenceGlyphs()]
  test('SPEC.md code fences use non-ASCII glyphs at all', () => {
    expect(chars.length).toBeGreaterThan(10)
  })

  for (const [ch, line] of chars) {
    const cp = ch.codePointAt(0)!
    const name = `${ch} U+${cp.toString(16).toUpperCase().padStart(4, '0')} (SPEC.md:${line})`
    test(`${name} renders from a declared face at one Plex cell`, () => {
      const hit = resolve(cp, DECLARED)
      expect(hit ? 'declared face' : 'system fallback').toBe('declared face')
      expect(hit!.advance).toBeCloseTo(PLEX_ADVANCE, 6)
    })
  }
})
