<div align="center">

# ANVIL

**A**gent-**N**ative **V**isual **I**nteraction **L**anguage

A tiny DSL an LLM writes inside a fenced code block, which renders as **real UI
inline in the conversation**. Every interaction compiles back to structured text
the model reads as an ordinary turn.

[Spec](./SPEC.md) · [Parser](./packages/parser) · [HTML renderer](./packages/render-html) · [anvil-md.frst.dev](https://anvil-md.frst.dev)

</div>

---

## The idea

Two halves, and nothing in between.

**Down**, mid-sentence, in an ordinary assistant message:

````markdown
Nice. Which of these feels like you?

```anvil
@gallery id=mood select=many max=2
? Pick the ones that feel right
- ed | Editorial | dense, warm | img=https://example.com/ed.jpg
- sw | Swiss     | airy, cold  | img=https://example.com/sw.jpg
- br | Brutal    | loud, black | img=https://example.com/br.jpg
```
````

**Up**, once the human has clicked:

```xml
<stamp block="mood" kind="gallery" values="ed,br" labels="Editorial,Brutal">
I picked Editorial and Brutal.
</stamp>
```

That tag is the entire integration. No tool calls, no widget runtime, no event
bus reaching into the agent loop. The model emits markdown and reads text.

## Why not just use a form, or a tool call?

Because a tool call costs a round trip and renders **somewhere else** -- a modal,
a panel, a side channel. ANVIL costs four lines of markdown typed mid-sentence
and renders **exactly where the question was asked**, which means the transcript
still makes sense when you read it back.

And because of one axiom:

> A conversation transcript is an append-only record of things that happened.\
> A widget that can be re-answered turns that record into a lie.

So an ANVIL block is answered **once** and then frozen -- a *stamp*. The rejected
options stay visible, because they are part of the record: they show what the
human was choosing between.

## Install

```sh
bun add @anvil-md/parser @anvil-md/render-html
```

```ts
import { parseAnvil } from '@anvil-md/parser'
import { renderAnvilFence } from '@anvil-md/render-html'
import '@anvil-md/render-html/anvil.css'

// In your markdown pipeline, when you hit a fence with lang === 'anvil':
const html = renderAnvilFence(fenceBody, fenceIsClosed)
```

`fenceIsClosed` is false while the message is still streaming, which renders the
block visibly provisional and never answerable.

## Packages

| Package | What it is | State |
|---|---|---|
| [`@anvil-md/parser`](./packages/parser) | Document model + parser. Zero dependencies, no DOM. | Stable |
| [`@anvil-md/render-html`](./packages/render-html) | Fence -> HTML string, plus a baseline stylesheet. | Display only |

**Display only** means the emitted controls carry `disabled`: this renders a
block, it does not run one. Stamping -- the answer half in [§6](./SPEC.md#6-the-stamp)
and [§7](./SPEC.md#7-stamp-lifecycle) of the spec -- is specified but not yet
implemented here. Those two sections are the contract if you want to build it.

## The blocks

```
   ASK  @choice  @gallery  @input  @upload  @link  @scale  @order
   SHOW @note    @code     @example
   CTRL @void
```

Ten blocks and one directive, and the set is **closed on purpose**. Nearly
everything you will want to add is one of these with an attribute set.

Full grammar, every attribute, and the ASCII of what each one renders as:
**[SPEC.md](./SPEC.md)**.

## The parser is total

It has no throw path. An LLM emits a fence token by token, so every prefix of
every fence is a real input a renderer will see -- and a thrown parse error inside
a page renderer takes down far more than one block.

Malformed input degrades with a visible warning instead: an unknown `@kind`
becomes a warned note, an unknown sigil folds into the prompt, an unknown field
type falls back to `text` and says so, and an over-long option list renders in
full with a complaint rather than being truncated.

The load-bearing test fuzzes **every prefix of every fixture**.

```sh
bun test
```

## Security posture

Three things this gets right, because they are easy to get wrong:

- **Attribute-position values are allowlisted, not escaped.** `swatch`, `font`
  and `img` land in `style` and `src`, where escaping is not sufficient. Hex
  only, conservative family names, `http(s)` only -- anything else is dropped.
- **Stamps are untrusted input.** They are free text somebody typed, and they sit
  right next to the agent's own markdown. Frame them as data, not instructions
  ([§8.1](./SPEC.md#81-a-stamp-is-untrusted-input)).
- **Stamping needs its own permission.** Being able to *see* a question is not
  consent to *answer* it on someone else's behalf
  ([§8.2](./SPEC.md#82-stamping-is-permission-gated)).

## Status

v1 of the spec. The parser and renderer are implemented and tested; stamping is
specified and not built. `@upload`, `@link`, `@order`, `@example`, `@void` and
`@code` are specified; the shipped renderer covers `@choice`, `@gallery`,
`@input`, `@scale` and `@note`.

Anything not built is described in [SPEC.md](./SPEC.md) precisely enough to build
against. [§14](./SPEC.md#14-conformance) lists what conformance means.

## Licence

MIT. Icon geometry is Lucide (ISC) -- see [LICENSE](./LICENSE).
