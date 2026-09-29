/**
 * The rules.
 *
 * A rule is a function over the whole document. That is the point of having a
 * linter at all: the parser is TOTAL and single-pass, so it can only complain
 * about the line in front of it. Two blocks sharing an id, a form hiding inside
 * a grid, an `ask=` with nothing to pick -- none of those are visible from one
 * line, and none of them can be made a parse error without giving the parser a
 * throw path it must not have.
 *
 * Severity is about consequence, not confidence:
 *   error -- the block will mislead a human, or cannot work at all
 *   warn  -- the block works and the spec says do not do this
 *   info  -- a nudge; a good agent would have written it differently
 */
import {
  type AnvilBlock,
  attrString,
  isContainer,
  isMulti,
  MESSAGE_CHANNELS,
  MESSAGE_STATES,
  messageAt,
  messageState,
  recipients,
  taskProgress,
} from '@anvil-md/parser'

export type Severity = 'error' | 'warn' | 'info'

export interface Diagnostic {
  rule: string
  severity: Severity
  /** Block id, or `''` for a container or a document-level finding. */
  block: string
  kind: string
  message: string
  /** The SPEC.md section this rule enforces. */
  spec: string
}

export interface Rule {
  id: string
  severity: Severity
  spec: string
  /** One line, shown by `anvil-lint --rules`. */
  about: string
  run: (blocks: AnvilBlock[], report: (b: AnvilBlock | null, message: string) => void) => void
}

/**
 * Blocks that are asking something RIGHT NOW, and will therefore stamp.
 *
 * A message past `draft` has already been answered, so it is a record with a
 * receipt on it, not a question -- and four sent messages in a grid is a
 * gallery of outcomes rather than the form `no-question-in-a-grid` is worried
 * about.
 */
function isAsk(b: AnvilBlock): boolean {
  if (b.kind === 'choice' || b.kind === 'gallery' || b.kind === 'input' || b.kind === 'scale') return true
  if (b.kind === 'card') return attrString(b, 'ask').length > 0
  if (b.kind === 'message') return attrString(b, 'ask').length > 0 && messageState(b) === 'draft'
  return false
}

/** Attributes every block may carry, whatever its kind. */
const COMMON_ATTRS = new Set(['id', 'icon', 'as'])

const ASK_ATTRS = new Set(['select', 'submit', 'min', 'max', 'expires', 'optional', 'danger', 'phrase'])

const KIND_ATTRS: Record<string, Set<string>> = {
  // `recommend` is not in ASK_ATTRS: it only means something where there are
  // rows to pick, and the parser already says so everywhere else.
  choice: new Set(['recommend']),
  gallery: new Set(['render', 'recommend']),
  input: new Set([]),
  scale: new Set(['steps']),
  note: new Set(['tone']),
  card: new Set(['type', 'status', 'href', 'ask', 'recommend']),
  board: new Set(['max', 'ask']),
  message: new Set(['channel', 'to', 'cc', 'bcc', 'from', 'subject', 'sent', 'state', 'at', 'by', 'error', 'ask']),
  chart: new Set(['render', 'unit', 'min', 'max', 'goal', 'values', 'better']),
  flow: new Set(['dir']),
  grid: new Set(['cols', 'min', 'gap', 'frame']),
  stack: new Set(['gap', 'frame']),
}

/** Attributes an agent reaches for that this language deliberately does not have. */
const PHANTOM_PROGRESS = ['progress', 'done', 'total', 'pct', 'percent', 'completed', 'complete']

export const RULES: Rule[] = [
  {
    id: 'no-duplicate-id',
    severity: 'error',
    spec: '7.3',
    about: 'Two blocks in one document must not share an id.',
    run(blocks, report) {
      const seen = new Map<string, AnvilBlock>()
      for (const b of blocks) {
        if (!b.id || b.derivedId) continue
        const first = seen.get(b.id)
        if (first) {
          // Stamps are idempotent on (blockId, nonce), so a shared id means the
          // second block's answer lands on the first one -- or is rejected as a
          // replay. Either way one of them is unanswerable.
          report(b, `id "${b.id}" is already used by the @${first.kind} above; a stamp cannot tell them apart`)
        } else {
          seen.set(b.id, b)
        }
      }
    },
  },
  {
    id: 'no-authored-progress',
    severity: 'error',
    spec: '4.12.1',
    about: 'A card counts its rows. There is no progress attribute to set.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'card' && b.kind !== 'board') continue
        for (const name of PHANTOM_PROGRESS) {
          if (b.attrs[name] === undefined) continue
          report(b, `"${name}=" does nothing: the bar is counted from the rows, and that is the point of @${b.kind}`)
        }
      }
    },
  },
  {
    id: 'ask-needs-something-to-pick',
    severity: 'error',
    spec: '4.12.4',
    about: 'A card asking what is next must have an open row to offer.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'card' || !attrString(b, 'ask')) continue
        if (b.tasks.some(t => t.state === 'todo')) continue
        report(b, 'ask= offers only [ ] rows, and this card has none: the question cannot be answered')
      }
    },
  },
  {
    id: 'message-needs-a-recipient',
    severity: 'error',
    spec: '4.15',
    about: 'A message with a send gate must say who it is going to.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'message' || !attrString(b, 'ask')) continue
        if (recipients(b, 'to').length) continue
        report(b, 'ask= asks a human to approve a send with no "to=": approve it to whom?')
      }
    },
  },
  {
    id: 'message-state-is-known',
    severity: 'error',
    spec: '4.15.5',
    about: 'An unrecognised state= silently falls back to draft.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'message') continue
        const declared = attrString(b, 'state').trim().toLowerCase()
        if (!declared || (MESSAGE_STATES as readonly string[]).includes(declared)) continue
        // Falling back to draft is the safe direction, but silently calling a
        // sent message a draft is still wrong, and loudly is better.
        report(b, `state="${declared}" is not a state; drawn as draft. Known: ${MESSAGE_STATES.join(', ')}`)
      }
    },
  },
  {
    id: 'message-stamped-state-needs-a-gate',
    severity: 'warn',
    spec: '4.15.5',
    about: 'approved and declined are written by a stamp, so there must be something that was stamped.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'message' || attrString(b, 'ask')) continue
        const state = messageState(b)
        // Only the two states a STAMP can produce. `sent` and `failed` are fine
        // without a gate: an agent that was authorised in advance sends first
        // and shows the record afterwards, and that record is a real thing to
        // want. Requiring a question there would ban it.
        if (state !== 'approved' && state !== 'declined') continue
        report(b, `state="${state}" is written by a stamp, but there is no ask= for anyone to have stamped`)
      }
    },
  },
  {
    id: 'message-outcome-needs-a-time',
    severity: 'info',
    spec: '4.15.5',
    about: 'A terminal state without a timestamp loses when it happened.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'message') continue
        const state = messageState(b)
        if (state === 'draft' || messageAt(b)) continue
        report(b, `state="${state}" with no at=: the transcript records that it happened, but not when`)
      }
    },
  },
  {
    id: 'message-failure-says-why',
    severity: 'warn',
    spec: '4.15.5',
    about: 'A failed send with no reason gives the human nothing to act on.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'message' || messageState(b) !== 'failed') continue
        if (attrString(b, 'error').trim()) continue
        report(b, 'state="failed" with no error=: the human is told it broke and not what broke')
      }
    },
  },
  {
    id: 'message-body-is-required',
    severity: 'error',
    spec: '4.15',
    about: 'A message with no body is a send gate over nothing.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'message' || b.prose.trim()) continue
        report(b, 'no "> " body: a human cannot approve a message they cannot read')
      }
    },
  },
  {
    id: 'danger-needs-a-phrase',
    severity: 'warn',
    spec: '4',
    about: 'A block-level danger= should make the human type something.',
    run(blocks, report) {
      for (const b of blocks) {
        // BLOCK-level danger only. A single `- !row` among four is one
        // destructive option in an ordinary question, and §4 defines `phrase`
        // as going with `danger` -- the row gets the deliberate second click.
        // Firing on `!` flagged §4.1's own example, which is correct as written.
        if (!b.attrs.danger || b.attrs.phrase) continue
        report(b, 'danger= with no phrase=: a second click is not much of a speed bump')
      }
    },
  },
  {
    id: 'no-question-in-a-grid',
    severity: 'warn',
    spec: '10',
    about: 'A grid holds records. Two questions side by side is a form.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'grid') continue
        const asks = b.children.filter(isAsk)
        if (asks.length < 2) continue
        report(b, `${asks.length} questions side by side is a form, and §10 argues an interview beats a form`)
      }
    },
  },
  {
    id: 'ask-block-needs-a-prompt',
    severity: 'warn',
    spec: '4',
    about: 'A block that asks something should say what it is asking.',
    run(blocks, report) {
      for (const b of blocks) {
        if (!isAsk(b) || b.kind === 'card' || b.kind === 'message') continue
        if (b.prompt.trim()) continue
        report(b, 'no "? " line: the human is being asked to choose without being told what for')
      }
    },
  },
  {
    id: 'no-empty-block',
    severity: 'warn',
    spec: '11',
    about: 'A block with no rows renders as an empty frame.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind === 'note' || b.kind === 'message' || isContainer(b.kind)) continue
        const rows =
          b.options.length + b.fields.length + b.dials.length + b.tasks.length + b.data.length + b.nodes.length + b.edges.length
        if (rows > 0) continue
        report(b, `@${b.kind} has no rows and renders as an empty frame`)
      }
    },
  },
  {
    id: 'no-empty-container',
    severity: 'warn',
    spec: '4.14',
    about: 'An empty container is markup with nothing in it.',
    run(blocks, report) {
      for (const b of blocks) {
        if (!isContainer(b.kind) || b.children.length) continue
        report(b, `@${b.kind} holds nothing`)
      }
    },
  },
  {
    id: 'grid-of-one',
    severity: 'info',
    spec: '4.14',
    about: 'A grid around a single block is a wrapper that changes nothing.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'grid' || b.children.length !== 1) continue
        report(b, 'a grid of one block lays out identically to the block on its own')
      }
    },
  },
  {
    id: 'unknown-attribute',
    severity: 'warn',
    spec: '4',
    about: 'An attribute the block does not read is a silent no-op.',
    run(blocks, report) {
      for (const b of blocks) {
        const own = KIND_ATTRS[b.kind]
        if (!own) continue
        const ask = isAsk(b)
        for (const name of Object.keys(b.attrs)) {
          if (COMMON_ATTRS.has(name) || own.has(name)) continue
          if (ASK_ATTRS.has(name)) {
            // On a record these are meaningless rather than unknown, and that
            // is a different and more useful thing to say.
            if (!ask) report(b, `"${name}=" is an ASK attribute and @${b.kind} is not asking anything here`)
            continue
          }
          if (PHANTOM_PROGRESS.includes(name)) continue // no-authored-progress owns these
          report(b, `"${name}=" is not an attribute of @${b.kind} and is ignored`)
        }
      }
    },
  },
  {
    id: 'message-channel-is-known',
    severity: 'warn',
    spec: '4.15.4',
    about: 'An unrecognised channel is drawn as a plain memo.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'message') continue
        const c = attrString(b, 'channel').toLowerCase()
        if (!c || (MESSAGE_CHANNELS as readonly string[]).includes(c)) continue
        report(b, `channel="${c}" has no chrome; it draws as a memo. Known: ${MESSAGE_CHANNELS.join(', ')}`)
      }
    },
  },
  {
    id: 'too-many-options',
    severity: 'info',
    spec: '10',
    about: 'Past about six options the real answer is an @input.',
    run(blocks, report) {
      for (const b of blocks) {
        const cap = b.kind === 'gallery' ? 8 : 6
        if (b.options.length <= cap) continue
        report(b, `${b.options.length} options is past the ${cap} a human scans in one pass`)
      }
    },
  },
  {
    id: 'multi-select-bounds',
    severity: 'warn',
    spec: '4',
    about: 'min and max must be satisfiable by the rows present.',
    run(blocks, report) {
      for (const b of blocks) {
        if (!isMulti(b)) continue
        const n = b.options.length
        const min = Number.parseInt(attrString(b, 'min'), 10)
        if (Number.isFinite(min) && min > n) {
          report(b, `min=${min} with ${n} options: the submit button can never arm`)
        }
      }
    },
  },
  {
    id: 'blocked-row-should-say-why',
    severity: 'info',
    spec: '4.12',
    about: 'A blocked subtask with no reason tells the human nothing.',
    run(blocks, report) {
      for (const b of blocks) {
        for (const t of b.tasks) {
          if (t.state !== 'blocked' || t.meta.trim() || t.detail.trim()) continue
          report(b, `"${t.ref}" is blocked with no reason in its meta cell or detail`)
        }
      }
    },
  },
  {
    id: 'card-should-be-scannable',
    severity: 'info',
    spec: '10',
    about: 'A card with a very long subtask list stops being scannable.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'card' || b.tasks.length <= 12) continue
        report(b, `${b.tasks.length} subtasks; an epic of cards reads better than one very long checklist`)
      }
    },
  },
  {
    id: 'chart-is-scannable',
    severity: 'info',
    spec: '4.16',
    about: 'Past two dozen rows a bar chart is a table; a line is the shape you wanted.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'chart' || b.data.length <= 24) continue
        const mode = attrString(b, 'render', 'bar').toLowerCase()
        if (mode === 'line' || mode === 'spark') continue
        report(b, `${b.data.length} rows: only the first 24 are drawn. render=line carries a long series`)
      }
    },
  },
  {
    id: 'spark-needs-a-series',
    severity: 'info',
    spec: '4.16',
    about: 'Two points make a slope, not a trend.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'chart' || b.data.length >= 3) continue
        const mode = attrString(b, 'render', 'bar').toLowerCase()
        if (mode !== 'spark' && mode !== 'line') continue
        report(b, `render=${mode} with ${b.data.length} point(s) draws a line nobody can read a trend off`)
      }
    },
  },
  {
    id: 'chart-unit-is-not-in-the-values',
    severity: 'warn',
    spec: '4.16',
    about: 'A unit written into every value cell prints twice once unit= is set.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'chart' || !attrString(b, 'unit')) continue
        // The renderer prints `raw`, so a row written `42ms` under `unit=ms`
        // comes out `42ms ms`. Caught here rather than papered over there:
        // guessing which one the agent meant is how a value stops being what
        // was typed.
        const suffixed = b.data.filter(d => /[a-z%°]$/i.test(d.raw))
        if (!suffixed.length) continue
        report(b, `unit="${attrString(b, 'unit')}" with ${suffixed.length} value(s) that already carry a suffix ("${suffixed[0]?.raw}")`)
      }
    },
  },
  {
    id: 'flow-node-is-orphaned',
    severity: 'info',
    spec: '4.17',
    about: 'A declared node no arrow touches is usually a typo in an id.',
    run(blocks, report) {
      for (const b of blocks) {
        if (b.kind !== 'flow' || !b.edges.length) continue
        const touched = new Set<string>()
        for (const e of b.edges) touched.add(e.from), touched.add(e.to)
        // A flow with no edges at all is a list, and `no-empty-block` has
        // nothing to say about it either -- but one orphan among six connected
        // nodes is almost always `retry-1` declared and `retry1` wired up.
        for (const n of b.nodes) {
          if (touched.has(n.id)) continue
          report(b, `"${n.id}" is declared but no arrow reaches it; check the id against the edge rows`)
        }
      }
    },
  },
  {
    id: 'epic-rollup-is-consistent',
    severity: 'info',
    spec: '4.12.1',
    about: 'Mixing rolled-up and bare rows makes the parent total hard to read.',
    run(blocks, report) {
      for (const b of blocks) {
        const p = taskProgress(b)
        if (!p.rollup) continue
        const bare = b.tasks.filter(t => t.total === undefined)
        if (!bare.length) continue
        report(
          b,
          `${bare.length} of ${b.tasks.length} rows carry no count, so each is scored 1 of 1 against children worth more`,
        )
      }
    },
  },
]

export const RULE_IDS = RULES.map(r => r.id)
