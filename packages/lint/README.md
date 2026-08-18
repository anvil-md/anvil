# @anvil-md/lint

A validator for ANVIL source.

The parser is **total** and single-pass, which is what keeps a streaming fence
from white-screening a transcript -- and also what stops it saying anything
useful about two blocks at once. It can tell you a row is malformed. It cannot
tell you that two blocks share an id, that a grid is hiding a form, or that a
card is asking a question with nothing left to pick.

That is this package.

```sh
bunx anvil-lint README.md docs/*.md    # every ```anvil fence in each file
bunx anvil-lint --raw block.anvil      # the file IS one fence
cat spec.md | bunx anvil-lint          # stdin
bunx anvil-lint --json .               # machine-readable, for CI
bunx anvil-lint --rules                # what it checks, and which § says so
```

Exit 1 on anything at `error` severity. `--strict` promotes warnings too.

## As a library

```ts
import { lint, lintMarkdown } from '@anvil-md/lint'

const { diagnostics, ok } = lint('@card id=c progress=50\n- [ ] a')
// [{ rule: 'no-authored-progress', severity: 'error', ... }]

lintMarkdown(await Bun.file('README.md').text(), 'README.md')
```

Every parse warning is folded in as a diagnostic, so lint output is a strict
superset of what the parser already told you.

## Severity means consequence, not confidence

| | |
|---|---|
| `error` | the block will mislead a human, or cannot work at all |
| `warn` | the block works and the spec says do not do this |
| `info` | a nudge; a good agent would have written it differently |

## The rules

Nineteen, each pinned to the section of [SPEC.md](../../SPEC.md) it enforces.
`--rules` prints the current list. The ones worth knowing:

- **`no-authored-progress`** -- `progress=`, `done=`, `total=` and friends do
  nothing on a `@card`, because the bar is counted from the rows. An agent
  reaching for one has misunderstood the block, and that is worth an error
  rather than a shrug.
- **`no-duplicate-id`** -- stamps are idempotent on `(blockId, nonce)`, so two
  blocks sharing an id means one of them is unanswerable.
- **`message-sent-is-not-a-question`** -- `sent=` and `ask=` together offer a
  human the chance to approve something that already happened.
- **`no-question-in-a-grid`** -- a grid holds records. Two ASK blocks side by
  side is a form, and §10 spends a section arguing an interview beats one.
- **`ask-needs-something-to-pick`** -- a card whose `ask=` has no `[ ]` rows
  left is a question that cannot be answered.

## It runs against its own specification

`bun test` lints every ```` ```anvil ```` fence in `SPEC.md`, and the suite
fails if a rule fires on the document that defines the rule. When that happens,
one of the two is wrong -- which is the whole argument for having a linter.

It has already earned its keep once: `danger-needs-a-phrase` fired on §4.1's own
`- !scrap` row. The example was right and the rule was too broad. `phrase=` is
defined as going with a block-level `danger`; one destructive option among four
gets the deliberate second click, not a typed phrase. The rule got narrower.

## Nothing here throws

Same contract as the parser, for the same reason: this runs over agent-authored
text. A rule that throws is caught and reported as a diagnostic about itself,
so one bad rule cannot take the run down. Tested against every prefix of every
hostile fixture.

MIT.
