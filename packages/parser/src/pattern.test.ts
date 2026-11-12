import { describe, expect, test } from 'bun:test'
import { compilePattern, matchPattern } from './pattern'

function matches(src: string, value: string): boolean {
  const v = compilePattern(src)
  if (!v.ok) throw new Error(`refused: ${v.why}`)
  return matchPattern(v.pattern, value)
}

function refusal(src: string): string {
  const v = compilePattern(src)
  return v.ok ? '' : v.why
}

describe('the §4.3.1 dialect', () => {
  test('classes: ranges, edge hyphens, negation, escapes inside', () => {
    expect(matches('[a-z-]+', 'well-known')).toBe(true)
    expect(matches('[a-z-]+', 'Well')).toBe(false)
    expect(matches('[^0-9]+', 'abc')).toBe(true)
    expect(matches('[^0-9]+', 'a1')).toBe(false)
    expect(matches('[\\d.]+', '3.14')).toBe(true)
    expect(matches('[\\]]', ']')).toBe(true)
  })

  test('dot stops at a line break, the way JavaScript and the corpus say', () => {
    expect(matches('a.b', 'a-b')).toBe(true)
    expect(matches('a.b', 'a\nb')).toBe(false)
  })

  test('astral characters are one character, written raw or as \\u{…}', () => {
    expect(matches('\\u{1F600}{2}', '😀😀')).toBe(true)
    expect(matches('.', '😀')).toBe(true)
  })

  test('alternation, empty branches and groups', () => {
    expect(matches('a|', '')).toBe(true)
    expect(matches('(?:ab|cd){2}', 'abcd')).toBe(true)
    expect(matches('(?:ab|cd){2}', 'abc')).toBe(false)
    expect(matches('colou?r', 'color')).toBe(true)
  })

  test('^ and $ are allowed and mean what anchoring already does', () => {
    expect(matches('^SE\\d{10}01$', 'SE556677889901')).toBe(true)
    expect(matches('a^b', 'ab')).toBe(false)
  })

  test('counted repeats', () => {
    expect(matches('x{2,3}', 'xx')).toBe(true)
    expect(matches('x{2,3}', 'xxxx')).toBe(false)
    expect(matches('x{2,}', 'xxxxxxx')).toBe(true)
    expect(matches('x{0}', '')).toBe(true)
  })

  test('a lazy marker is accepted and changes nothing about a whole-value match', () => {
    expect(matches('a+?b', 'aaab')).toBe(true)
  })

  test('every refusal names its construct', () => {
    expect(refusal('a{')).toContain('{n}')
    expect(refusal('[abc')).toContain('never closed')
    expect(refusal('(ab')).toContain('never closed')
    expect(refusal('ab)')).toContain('")"')
    expect(refusal('a**')).toContain('repeats a repeat')
    expect(refusal('*a')).toContain('nothing before it')
    expect(refusal('x{101}')).toContain('above 100')
    expect(refusal('x{3,2}')).toContain('minimum above its maximum')
    expect(refusal('(?<n>a)')).toContain('named groups')
    expect(refusal('(?<=a)b')).toContain('lookbehind')
    expect(refusal('(?i)a')).toContain('inline flags')
    expect(refusal('\\bword')).toContain('word boundaries')
    expect(refusal('\\p{L}')).toContain('property')
    expect(refusal('\\q')).toContain('not an escape')
    expect(refusal('[z-a]')).toContain('backwards')
    expect(refusal('[\\d-z]')).toContain('single character')
    expect(refusal('^*')).toContain('cannot be repeated')
    expect(refusal('')).toContain('empty')
    expect(refusal('a'.repeat(257))).toContain('256')
  })

  test('counted repeats cannot multiply the machine past its cap', () => {
    expect(refusal('(?:(?:(?:a{100}){100}){100})')).toContain('expands past')
  })

  test('linear: nested repeats on a hostile value answer in milliseconds', () => {
    const hostile = `${'a'.repeat(4000)}b`
    const started = performance.now()
    expect(matches('(a*)*(a+)+(a|aa)+$', hostile)).toBe(false)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  test('a value past the cut-off never matches', () => {
    expect(matches('a*', 'a'.repeat(4097))).toBe(false)
    expect(matches('a*', 'a'.repeat(4096))).toBe(true)
  })
})
