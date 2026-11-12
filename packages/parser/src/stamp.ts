/**
 * The stamp (§6): what a client sends back when a human answers a block.
 *
 * ONE serializer and one escaping policy (§6.2). A port of AnvilKit's
 * `AnvilStamp`, held to the same SPEC 6.2 literals, so a stamp written by the
 * phone and one written by a bridge on a server are the same bytes.
 *
 * Unlike the Swift client, which stamps what its own controls produced, this
 * one is also the SERVER's: an answer arriving from another renderer (an A2UI
 * action, §4.1.2's offered rows) is untrusted input. So `stampAnswer` checks
 * it against the block and refuses what the block could never have produced:
 * a value nobody was offered, two picks on a select=one, a field that fails
 * its own check (§4.3.1), a notch off the end of the track.
 */
import { checkField } from './checks'
import type { AnvilBlock, AnvilOption } from './types'
import { attrNumber, isMulti } from './types'

export type StampAttr = readonly [key: string, value: string]

export interface StampChild {
  name: string
  attrs: StampAttr[]
  /** Text content. Absent writes a self-closing element. */
  text?: string
}

export interface AnvilStamp {
  block: string
  kind: string
  /** The payload, in wire order, `at` and `by` included. */
  attrs: StampAttr[]
  children: StampChild[]
  /** The sentence a human would have typed. Empty writes no body line. */
  body: string
}

/** What a human did to a block. */
export type AnvilAnswer =
  /** @choice / @gallery: one value on select=one, any number on select=many. */
  | { kind: 'pick'; values: string[] }
  /** @input: a value per field name. Secrets are masked HERE, not by the caller. */
  | { kind: 'input'; fields: Record<string, string> }
  /** @scale: a 1-based notch per dial name. A dial left alone keeps its default. */
  | { kind: 'scale'; values: Record<string, number> }

export interface StampOptions {
  /** When the human answered, ISO 8601. */
  at?: string
  /** Who answered, where more than one human can act. */
  by?: string
  /** The courtesy sentence. Absent writes the default one. */
  body?: string
  /** §4.1.2: the rows a live block showed. Absent means the written rows. */
  offered?: { fn: string; rows: AnvilOption[] }
}

export type StampResult = { ok: true; stamp: AnvilStamp } | { ok: false; refused: string }

/** §7.6: a secret is replaced in the record, the receipt and the tag. */
export const STAMP_MASK = '••••••'

const PICKED = new Set(['choice', 'gallery'])

/** The stamp for `answer` on `block`, or the reason the block refuses it. */
export function stampAnswer(block: AnvilBlock, answer: AnvilAnswer, opts: StampOptions = {}): StampResult {
  const made = payload(block, answer, opts)
  if ('refused' in made) return { ok: false, refused: made.refused }
  const tail: StampAttr[] = []
  if (opts.at) tail.push(['at', opts.at])
  if (opts.by) tail.push(['by', opts.by])
  return {
    ok: true,
    stamp: { block: block.id, kind: block.kind, attrs: [...made.attrs, ...tail], children: made.children, body: opts.body ?? made.body },
  }
}

type Made = { attrs: StampAttr[]; children: StampChild[]; body: string } | { refused: string }

function payload(block: AnvilBlock, answer: AnvilAnswer, opts: StampOptions): Made {
  if (!block.id) return { refused: 'a block with no id cannot stamp' }
  if (answer.kind === 'pick') return pick(block, answer.values, opts)
  if (answer.kind === 'input') return input(block, answer.fields)
  return scale(block, answer.values)
}

function pick(block: AnvilBlock, values: string[], opts: StampOptions): Made {
  if (!PICKED.has(block.kind)) return { refused: `@${block.kind} has no rows to pick` }
  const rows = opts.offered ? opts.offered.rows : block.options
  const chosen = new Set(values)
  if (chosen.size !== values.length) return { refused: 'the same row was picked twice' }
  const unknown = values.find(v => !rows.some(r => r.value === v))
  if (unknown !== undefined) return { refused: `"${unknown}" was not one of the rows offered` }
  // Row order, not click order: the same answer is the same stamp.
  const picked = rows.filter(r => chosen.has(r.value))
  const many = isMulti(block)
  if (!many && picked.length !== 1) return { refused: 'select=one takes exactly one row' }
  if (many) {
    const min = attrNumber(block, 'min', 1)
    const max = attrNumber(block, 'max', rows.length)
    if (picked.length < min) return { refused: `at least ${min} rows must be picked` }
    if (picked.length > max) return { refused: `at most ${max} rows can be picked` }
  }

  const labels = picked.map(r => r.label)
  const attrs: StampAttr[] = many
    ? [
        ['values', picked.map(r => r.value).join(',')],
        ['labels', labels.join(',')],
      ]
    : [
        ['value', picked[0]?.value ?? ''],
        ['label', labels[0] ?? ''],
      ]
  const children: StampChild[] = []
  if (opts.offered) {
    attrs.push(['query', opts.offered.fn])
    children.push(...opts.offered.rows.map(offeredChild))
  }
  return { attrs, children, body: `I picked ${list(labels)}.` }
}

/** What a row looks like beyond its words, written in this order. */
const FACE_KEYS = ['img', 'swatch', 'font', 'sample', 'alt'] as const

function offeredChild(row: AnvilOption): StampChild {
  const attrs: StampAttr[] = [
    ['value', row.value],
    ['label', row.label],
  ]
  if (row.hint) attrs.push(['hint', row.hint])
  for (const key of FACE_KEYS) {
    const v = key === 'swatch' ? row.swatch?.join(',') : row[key]
    if (v) attrs.push([key, v])
  }
  if (row.danger) attrs.push(['danger', 'true'])
  return { name: 'offered', attrs }
}

function input(block: AnvilBlock, fields: Record<string, string>): Made {
  if (block.kind !== 'input') return { refused: `@${block.kind} has no fields` }
  const stray = Object.keys(fields).find(name => !block.fields.some(f => f.name === name))
  if (stray !== undefined) return { refused: `"${stray}" is not a field of this block` }
  const children: StampChild[] = []
  for (const f of block.fields) {
    const value = Object.hasOwn(fields, f.name) ? String(fields[f.name] ?? '') : ''
    const verdict = checkField(f, value)
    if (!verdict.ok) return { refused: `${f.name}: ${verdict.error ?? verdict.reason}` }
    // Block order, and an empty field is not part of the answer.
    if (value === '') continue
    children.push({ name: 'field', attrs: [['name', f.name]], text: f.type === 'secret' ? STAMP_MASK : value })
  }
  return { attrs: [], children, body: 'I filled it in.' }
}

function scale(block: AnvilBlock, values: Record<string, number>): Made {
  if (block.kind !== 'scale') return { refused: `@${block.kind} has no dials` }
  const stray = Object.keys(values).find(name => !block.dials.some(d => d.name === name))
  if (stray !== undefined) return { refused: `"${stray}" is not a dial of this block` }
  const steps = attrNumber(block, 'steps', 5)
  const children: StampChild[] = []
  const said: string[] = []
  for (const d of block.dials) {
    const notch = Object.hasOwn(values, d.name) ? values[d.name] : d.value
    if (!Number.isInteger(notch) || (notch as number) < 1 || (notch as number) > steps) {
      return { refused: `${d.name}: ${notch} is not a notch from 1 to ${steps}` }
    }
    const n = notch as number
    children.push({
      name: 'dial',
      attrs: [
        ['name', d.name],
        ['value', String(n)],
        ['norm', norm(n, steps)],
        ['poles', `${d.left}|${d.right}`],
      ],
    })
    said.push(`${d.name} to ${n} of ${steps}`)
  }
  return { attrs: [['steps', String(steps)]], children, body: `I set ${list(said)}.` }
}

/** The notch as 0..1, two places at most, no trailing zeros: `0.25`, `0.5`, `1`. */
function norm(notch: number, steps: number): string {
  return String(Number(((notch - 1) / Math.max(steps - 1, 1)).toFixed(2)))
}

function list(items: string[]): string {
  if (items.length === 0) return 'nothing'
  if (items.length === 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The wire form, exactly as §6.1 specifies it. */
export function stampXml(s: AnvilStamp): string {
  const lines = [`<stamp${write([['block', s.block], ['kind', s.kind], ...s.attrs])}>`]
  for (const c of s.children) {
    const head = `  <${c.name}${write(c.attrs)}`
    lines.push(c.text === undefined ? `${head}/>` : `${head}>${escapeXml(c.text)}</${c.name}>`)
  }
  if (s.body) lines.push(escapeXml(s.body))
  lines.push('</stamp>')
  return lines.join('\n')
}

function write(attrs: readonly StampAttr[]): string {
  return attrs.map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('')
}

/** The one escaping policy. Text and attribute values both go through it. */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
