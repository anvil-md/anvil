<div align="center">

# ANVIL

**A**gent-**N**ative **V**isual **I**nteraction **L**anguage

A tiny DSL an LLM writes inside a fenced code block, which renders as **real UI
inline in the conversation**. Every interaction compiles back to structured text
the model reads as an ordinary turn.

[Spec](./SPEC.md) · [Parser](./packages/parser) · [HTML renderer](./packages/render-html) · [Linter](./packages/lint) · [Conformance](./packages/conformance) · [anvil-md.frst.dev](https://anvil-md.frst.dev)

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

**Core** -- the two you always need:

| Package | What it is | State |
|---|---|---|
| [`@anvil-md/parser`](./packages/parser) | Document model + parser. Zero dependencies, no DOM. | Stable |
| [`@anvil-md/render-html`](./packages/render-html) | Fence -> HTML string, plus a baseline stylesheet. | Display only |
| [`@anvil-md/lint`](./packages/lint) | `anvil-lint`: the checks a total parser cannot make. | Stable |
| [`@anvil-md/conformance`](./packages/conformance) | The corpus. One JSON file, any language. | Stable |

**Integrations** -- thin adapters so you do not hand-wire the fence branch:

| Package | Host | State |
|---|---|---|
| [`@anvil-md/marked`](./packages/marked) | [marked](https://marked.js.org) | Works |
| [`@anvil-md/markdown-it`](./packages/markdown-it) | [markdown-it](https://github.com/markdown-it/markdown-it) | Works |
| [`@anvil-md/react`](./packages/react) | React component + react-markdown | Works |
| [`@anvil-md/remark`](./packages/remark) | remark / unified, so MDX, Astro, Docusaurus | **Experimental** |

### The one thing every integration gets wrong

**Whether the fence has finished streaming.** An LLM emits a fence token by
token, and a block whose last option has not arrived must never look answerable.

Only **marked** can work this out by itself, because its `code` token keeps
`raw` -- the source *including* the delimiters. remark, markdown-it and
react-markdown all discard the delimiters during parsing, so by the time they
hand you a node the streaming state is gone. Those integrations assume complete
and take a `closed` option; pass it from whatever your host knows.

If you get to choose your markdown parser, choose marked.

**Display only** means the emitted controls carry `disabled`: this renders a
block, it does not run one. Stamping -- the answer half in [§6](./SPEC.md#6-the-stamp)
and [§7](./SPEC.md#7-stamp-lifecycle) of the spec -- is not implemented in the
TypeScript packages. The Swift package (`packages/swift`, AnvilKit) has it: the
§6.2 serializer, a reader for stamps in a transcript, and the first-wins ledger.
Those two sections are the contract if you want to build it here.

## The blocks

```
   ASK   @choice  @gallery  @input  @upload  @link  @scale  @order  @connect
   SHOW  @note    @code     @example  @board  @chart  @flow
   BOTH  @card    @message           (records, until ask= makes them questions)
   GRID  @grid    @stack    @end
   CTRL  @void
```

Sixteen blocks, two containers and one directive, and the set is **closed on
purpose**. Nearly everything you will want to add is one of these with an
attribute set.

Five of them are worth naming here, because they are the reason the set grew:

**`@card`** is a work item -- subtasks, status, a progress bar -- and the bar is
**counted from the rows**. There is no `progress=` attribute, deliberately. An
agent that writes `3/7` above nine subtasks is lying, and the format should not
hand it the vocabulary. An epic is the same block whose rows carry their own
counts.

**`@message`** is a message the agent is *proposing* to send: an email, a
WhatsApp, a Slack post, drawn with the chrome of the thing it will become. It
renders as **`draft · not sent`** until something asserts otherwise, addresses
are text rather than links, and with `ask=` it becomes an ordinary one-click
stamp -- so "did the human approve this" is a question the transcript can still
answer six months later.

**`@chart`** is numbers as a shape -- a bar, a column, a line, a sparkline, a dot
plot. It obeys `@card`'s rule from the other side: a card may not *author* a
number the rows could contradict, and a chart may not *draw* one the rows do not
contain. So the range starts at zero, an authored `max=` may widen it and never
narrow it, and every value is printed as text beside the shape. A chart floored
at its smallest value makes 98 look twice 96; a chart with a `max=` under its
data prints a number at the end of a bar too short to be that number. No axes,
no gridlines, no tooltips: this goes in a 380px chat column next to the sentence
that explains it.

**`@flow`** is a process -- a pipeline, a retry ladder, a state machine. **One
sigil, and the arrow decides**: a row with an arrow is an edge, a row without one
declares a node. The four `@card` checkbox states work on a node and mean the
same thing, so a deploy pipeline with two green stages and one blocked one costs
no new vocabulary. Cycles are drawn rather than dropped, the layout is computed
from a character count rather than measured, and the whole graph is emitted as
text alongside the SVG because an SVG has no reading order of its own.

**`@connect`** is the agent asking for a key to somewhere it cannot reach on its
own -- a Drive, a mailbox, a repo. The scopes are **rows, not a `scopes=`
attribute**, because the scopes are the thing being consented to and they need a
label and a reason a human will actually read. A grant comes back **partial**
more often than anyone expects, so the refused scopes stay on the block and go
into the stamp: an agent that reads only `state=partial` will try to write to a
Drive it was denied. And the provider's logo comes from a **host allowlist**,
never from the agent, because an agent-supplied image next to the words "Connect
Google" and a button is a phishing card in a surface the human already trusts.

`@grid` and `@stack` lay blocks out with **no breakpoints anywhere**: the agent
writing the fence cannot see the screen, `cols` is a maximum rather than a
count, and the collapse is computed against the container.

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

The critical test fuzzes **every prefix of every fixture**, hostile inputs
included -- and a separate list for inputs too big to walk prefix by prefix,
because size is its own failure mode. `Math.max(...values)` over a 200,000-row
`@chart` is a number in Bun and a `RangeError` in Node, and it ran inside the
parser: totality cannot depend on which runtime somebody installed this into.

One more runs against this repo's own prose: every ```` ```anvil ```` fence in
`SPEC.md` is parsed, and the ASCII picture underneath it is checked against what
the parser actually computes. The first draft of §4.12 printed `3/7 · 43%` over
five rows with two done -- the section arguing that hand-typed numbers are worth
banning from the language, illustrated with a hand-typed number that lied. The
argument was right; the document was the counter-example. Now it cannot be.

```sh
bun test
```

## Security posture

Three things this gets right, because they are easy to get wrong:

- **Attribute-position values are allowlisted, not escaped.** `swatch`, `font`,
  `img`, `href` and a grid's `min` land in `style`, `src` and `href`, where
  escaping is not sufficient. Hex only, conservative family names, `http(s)`
  only, plain lengths only -- anything else is dropped whole.
- **Every map indexed by agent text uses `Object.hasOwn`.** `MAP[key] ?? default`
  does not fall back for an inherited property, so `gap=constructor` substituted
  a function's source text into a CSS custom property and collapsed the grid.
- **Stamps are untrusted input.** They are free text somebody typed, and they sit
  right next to the agent's own markdown. Frame them as data, not instructions
  ([§8.1](./SPEC.md#81-a-stamp-is-untrusted-input)).
- **Stamping needs its own permission.** Being able to *see* a question is not
  consent to *answer* it on someone else's behalf
  ([§8.2](./SPEC.md#82-stamping-is-permission-gated)).

## Status

v1 of the spec. The parser and renderer are implemented and tested; stamping is
specified and not built.

| | |
|---|---|
| **Built** | `@choice` `@gallery` `@input` `@scale` `@note` `@card` `@board` `@message` `@chart` `@flow` `@grid` `@stack` |
| **Specified, not built** | `@upload` `@link` `@order` `@example` `@void` `@code` `@connect` |

That second row is asserted by a test, so it cannot quietly go stale: the day
one of them lands, the suite fails until somebody deletes the entry.

Anything not built is described in [SPEC.md](./SPEC.md) precisely enough to build
against. [§14](./SPEC.md#14-conformance) lists what conformance means.

## Licence

MIT. Icon geometry is Lucide (ISC) -- see [LICENSE](./LICENSE).
