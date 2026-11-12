/**
 * What a block is to assistive technology (§9.13): its accessible name, its
 * description, whether arriving announces it, and whether it is hidden.
 *
 * INFERRED FIRST, AUTHORED SECOND. Almost every block already says what it is
 * in visible text -- the `?` prompt is its name, the `:` subtext its
 * description -- and a renderer derives both from there without the agent
 * typing anything. The four attributes exist for the cases where the visible
 * text is not enough, and an authored value always beats an inferred one. That
 * is A2UI 1.0's rule too, which is where this section came from.
 *
 * `live=` is the odd one out in a language where blocks never change. It is
 * about ARRIVAL: a transcript adds blocks as the agent writes them, and a
 * screen reader user hears none of it unless something says so.
 */
import type { AnvilBlock, AnvilOption } from './types'
import { attrString, isContainer } from './types'

export type LiveMode = 'off' | 'polite' | 'assertive'

export const LIVE_MODES: readonly LiveMode[] = ['off', 'polite', 'assertive']

export interface AnvilA11y {
  /** The accessible name. `alt=`, else the prompt. May be empty for a bare note. */
  label: string
  /** `desc=`, else the subtext. */
  description: string
  live: LiveMode
  /** True only for `decorative` on a block that asks nothing. */
  hidden: boolean
}

/** The block attributes this file owns, for the linter's allowlist. */
export const A11Y_ATTRS = ['alt', 'desc', 'live', 'decorative'] as const

const ASK_KINDS = new Set(['choice', 'gallery', 'input', 'scale'])

/**
 * A block that is waiting for a human. Hiding one from a screen reader turns
 * it into a question only sighted people can answer, while the agent waits on
 * everybody.
 */
function asks(block: AnvilBlock): boolean {
  if (ASK_KINDS.has(block.kind)) return true
  if (block.kind === 'card' || block.kind === 'message') return attrString(block, 'ask').length > 0
  return false
}

function liveMode(block: AnvilBlock): LiveMode | null {
  const v = attrString(block, 'live').toLowerCase()
  return (LIVE_MODES as readonly string[]).includes(v) ? (v as LiveMode) : null
}

/**
 * The one inferred announcement: a danger note. It is the block an agent uses
 * for "production is down", and a reader who only finds it by scrolling has
 * found it too late. Everything else arrives quietly, because a transcript
 * that shouts every block is a transcript a screen reader user mutes.
 */
function inferredLive(block: AnvilBlock): LiveMode {
  return block.kind === 'note' && attrString(block, 'tone') === 'danger' ? 'assertive' : 'off'
}

export function blockA11y(block: AnvilBlock): AnvilA11y {
  const alt = attrString(block, 'alt').trim()
  const desc = attrString(block, 'desc').trim()
  const decorative = block.attrs.decorative !== undefined && block.attrs.decorative !== 'false'
  return {
    label: alt || block.prompt,
    description: desc || block.subtext,
    live: liveMode(block) ?? inferredLive(block),
    hidden: decorative && !asks(block) && !isContainer(block.kind),
  }
}

/** A row's accessible name: its `alt=` cell, else its label. */
export function optionAlt(o: AnvilOption): string {
  return o.alt?.trim() || o.label
}

/**
 * Every way the four attributes can be written wrong, as warnings. Each one
 * is a value the parser read and would otherwise drop without a word (§11).
 */
export function a11yProblems(block: AnvilBlock): string[] {
  const out: string[] = []
  for (const key of ['alt', 'desc'] as const) {
    const v = block.attrs[key]
    if (v === undefined) continue
    if (typeof v !== 'string' || !v.trim()) out.push(`${key}= needs words; it is ignored`)
  }
  const live = block.attrs.live
  if (live !== undefined && !liveMode(block)) {
    out.push(`live="${String(live)}" is not one of ${LIVE_MODES.join(', ')}; the block is announced as ${inferredLive(block)}`)
  }
  const decorative = block.attrs.decorative
  if (decorative !== undefined && decorative !== 'false') {
    if (isContainer(block.kind)) {
      out.push(`decorative on a @${block.kind} would hide every block inside it; it is ignored`)
    } else if (asks(block)) {
      out.push(`decorative is ignored: a question cannot be hidden from a screen reader while the agent waits for its answer`)
    }
  }
  return out
}
