# @anvil-md/parser

Parser and document model for [ANVIL](https://github.com/anvil-md/anvil) -- a tiny
DSL an LLM writes inside a fenced code block, which a host renders as real UI
inline in a conversation.

**Zero dependencies. No DOM. No framework.** Runs anywhere JavaScript runs.

```sh
bun add @anvil-md/parser
```

## Use

```ts
import { parseAnvil } from '@anvil-md/parser'

const doc = parseAnvil(`
@choice id=deploy
? Where should I ship this?
: Staging is wiped nightly.
- prod  | Production | live traffic, no undo
- stage | Staging    | safe
`)

doc.blocks[0].kind      // 'choice'
doc.blocks[0].id        // 'deploy'
doc.blocks[0].prompt    // 'Where should I ship this?'
doc.blocks[0].options   // [{ value: 'prod', label: 'Production', hint: '…' }, …]
doc.blocks[0].warnings  // []
```

While a message is still streaming, pass `partial`:

```ts
const doc = parseAnvil(chunk, { partial: true })
doc.partial // true -- render it, but never let anyone answer it yet
```

## It never throws

This is the point of the package, not a footnote.

An LLM emits a fence token by token, so **every prefix of every fence is a real
input** your renderer will see. A thrown parse error inside a page renderer takes
down far more than the block that caused it.

So `parseAnvil` is **total**. Malformed input degrades and records a warning on
the block:

| Input | Result |
|---|---|
| unknown `@kind` | a `note` with `tone=warn`, raw text kept |
| unknown leading sigil | folded into the prompt |
| unknown field type | falls back to `text`, warns |
| `> 12` options | all of them, plus a warning. Never truncated. |
| out-of-range `steps` or dial default | clamped, warns |
| unclosed quote, stray pipes, empty rows | absorbed, warns where it matters |
| `null`, a number, an object | coerced, never throws |

Warnings land on `block.warnings` so a renderer can **show** them. An agent that
wrote something the parser disliked should be able to see that.

## Ids are content-derived

A block with no `id=` gets one hashed from its kind and normalised body.

This is deliberately **not positional**: streaming can reorder or re-emit blocks,
and an id derived from array position would land an answer on the wrong block.
Same content, same id, every render and every reload.

```ts
parseAnvil('@choice\n- x | X').blocks[0].derivedId  // true
```

## API

```ts
function parseAnvil(source: string, opts?: { partial?: boolean }): AnvilDoc

interface AnvilDoc {
  blocks: AnvilBlock[]
  partial: boolean
}

interface AnvilBlock {
  kind: 'choice' | 'gallery' | 'input' | 'scale' | 'note'
  id: string
  derivedId: boolean
  prompt: string
  subtext: string
  attrs: Record<string, string | boolean>
  options: AnvilOption[]   // `-` rows
  fields: AnvilField[]     // `_` rows
  dials: AnvilDial[]       // `%` rows
  prose: string            // `>` lines
  warnings: string[]
}
```

Helpers: `attrString`, `attrNumber`, `galleryRender`, `isMulti`, plus the
`ANVIL_KINDS` and `FIELD_TYPES` constants.

## Grammar

See **[SPEC.md](https://github.com/anvil-md/anvil/blob/main/SPEC.md)** for the
full grammar, every block, every attribute, and the wire format for answers.

## Licence

MIT
