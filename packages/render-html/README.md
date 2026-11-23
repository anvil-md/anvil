# @anvil-md/render-html

Render an [ANVIL](https://github.com/anvil-md/anvil) fence to an HTML string,
plus a baseline stylesheet that works with no host theme.

```sh
bun add @anvil-md/render-html
```

## Use

```ts
import { renderAnvilFence } from '@anvil-md/render-html'
import '@anvil-md/render-html/anvil.css'

const html = renderAnvilFence(fenceBody, fenceIsClosed)
```

Wire it into whatever renders your markdown. With `marked`:

```ts
renderer.code = ({ text, lang, raw }) => {
  if (lang === 'anvil') {
    return renderAnvilFence(text, /\n`{3,}[ \t]*$/.test(raw))
  }
  // …your normal code path
}
```

The second argument is **false while the message is still streaming**. A block
whose last option has not arrived yet renders visibly provisional and must never
look answerable -- that is how someone answers a question they have not finished
reading.

## Why a string, not components

Most surfaces that render an agent's markdown already pipe it through a markdown
library and hydrate afterwards -- the same way mermaid diagrams and syntax
highlighting are usually handled. A string drops straight into that pipeline with
no framework coupling and no component lifecycle.

Use it from React, Vue, Svelte, a static site generator, or a plain server
response.

## Display only, unless you run stamping

**By default the emitted controls carry `disabled`.** The package draws a block;
it does not run one. Disabled controls are styled to look normal rather than
dimmed, so a rendered block reads as the real thing rather than as a broken form.

A host that runs stamping passes each block's state, and the same call draws it
open, pending or stamped:

```ts
import { renderAnvilFence } from '@anvil-md/render-html'
import { attachAnvil } from '@anvil-md/render-html/hydrate'

const html = renderAnvilFence(fenceBody, closed, {
  stamping: {
    resolve: id => states.get(id), // undefined = not known yet: drawn inert (§7.6)
    canStamp: viewer.mayAnswer,     // false = disabled, plus `waitingOn` (§8.2.1)
    waitingOn: 'waiting on an org admin',
  },
})

// Once, on the element your markdown renders into. Delegated, so re-renders are free.
attachAnvil(transcriptEl, {
  onAnswer: (blockId, answer) => server.stamp(blockId, answer),
})
```

| State | Draws |
|---|---|
| `undefined` | inert: visible, not clickable, no spinner |
| `{ state: 'open' }` | live controls; `error` adds an alert above the button |
| `{ state: 'pending', answer }` | everything disabled, the chosen row marked |
| `{ state: 'stamped', stamp }` | the record: the pick, every rejected row, who and when |

**The stamp itself still does not live here.** Law II puts it on your server,
keyed by block id; idempotency (§7.3), expiry (§7.5) and the permission gate
(§8.2) live there with it. Check every answer with `stampAnswer` from
`@anvil-md/parser` on the server, never on trust (§8.1), and wrap the stamp as
untrusted data when you hand it to the model.
[§6](https://github.com/anvil-md/anvil/blob/main/SPEC.md#6-the-stamp) and
[§7](https://github.com/anvil-md/anvil/blob/main/SPEC.md#7-stamp-lifecycle) are
the contract.

Stamping covers `@choice`, `@gallery`, `@input` and `@scale`. `@card ask=` and
`@message ask=` still draw display-only.

## Blocks covered

`@choice`, `@gallery` (`image` / `swatch` / `type` / `card`), `@input` (all eight
field types), `@scale`, `@note` (three tones), `@card`, `@board`, `@message`,
`@chart` (`bar` / `column` / `line` / `spark` / `dot` / `stat`), `@flow`, and the
`@grid` / `@stack` containers.

Specified but not yet rendered here: `@upload`, `@link`, `@order`, `@example`,
`@code`, `@void`, `@connect`. An unknown block degrades to a warned note rather
than vanishing, so a fence using one is still legible.

## Host faces

A product that draws the same record over and over -- a lead, an invoice, a
deploy -- registers a **face** for that `@card type=` instead of asking for a new
block ([SPEC.md](../../SPEC.md), §4.12.5):

```ts
import { type AnvilHost, renderAnvilFence } from '@anvil-md/render-html'

const host: AnvilHost = {
  faces: {
    lead: (block, { esc, stock }) =>
      `<div class="lead">${block.meta.flat().map(c => `<b>${esc(c)}</b>`).join('')}
         <p>${esc(block.prose)}</p></div>`,
  },
}

renderAnvilFence(fenceBody, closed, host)
```

The face returns the card's **body**. The frame around it -- ref, type chip,
counted status, title, warnings, the `snapshot` footer -- is still drawn here,
and three things are enforced rather than documented:

- **A face never draws a question.** A card with `ask=` renders the stock body.
- **A face cannot drop a fact.** Every task row, meta, detail, chip and prose line
  the parser read must appear in the face's output, or the frame gets a warning
  naming what is missing.
- **A face cannot take the transcript down.** One that throws falls back to the
  stock body with a warning.

`stock()` is the default body, for a face that decorates rather than redraws.
`esc` is the escaping every stock renderer uses: the text a face draws is still
agent text. Every adapter (`marked`, `markdown-it`, `remark`, `react`) takes the
same `host` option and passes it through.

## Theming

Everything is driven by `--anvil-*` custom properties scoped to `.anvil-doc`, so
nothing leaks into the surrounding page:

```css
.anvil-doc {
  --anvil-border: #d8d8dd;
  --anvil-primary: #c0392a;
  --anvil-radius: 4px;
}
```

`--anvil-warn` and `--anvil-danger` are **semantic, not brand colours**. They are
the only thing distinguishing a warn note from an info note, so pointing them at
a brand accent destroys the distinction. `--anvil-primary` is the decorative one;
bind that to your accent instead.

Dark mode follows `prefers-color-scheme`, and can be forced from any ancestor
carrying `[data-theme="dark"]` or `.dark`.

Skip `anvil.css` entirely and style the class names yourself if you prefer:
`.anvil-block`, `.anvil-row`, `.anvil-card`, `.anvil-field`, `.anvil-dial`,
`.anvil-note`, and friends.

> **One trap worth inheriting.** Every `color-mix()` in the stylesheet
> interpolates toward `transparent`, never toward a second hued token. Mixing two
> tokens that sit far apart on the hue wheel interpolates *across* the wheel and
> lands on a third hue that is neither -- an amber accent mixed with a blue-grey
> border comes out **teal**, and a "warn" note silently reads as an info box.

## Security

Values that land in `style` and `src` attributes are **allowlisted, not
escaped** -- escaping is not sufficient in attribute position:

| Value | Rule | Failure |
|---|---|---|
| `swatch=` | hex only | dropped |
| `font=` | conservative family name, no quotes or `url(` | dropped |
| `img=` | `http(s)` only | placeholder card |

Everything else -- prompts, labels, hints, placeholders -- is HTML-escaped. Icons
are inline SVG rather than text glyphs, so a missing font can never draw a tofu
box.

## API

```ts
function renderAnvilFence(source: string, closed: boolean, host?: AnvilHost): string
function esc(s: string): string
function icon(name: IconName): string
function resolveIcon(requested: unknown, fallback: IconName): IconName
function answerOf(stamp: AnvilStamp): AnvilAnswer          // a stamp read back into its answer

// @anvil-md/render-html/hydrate
function attachAnvil(root: HTMLElement, h: { onAnswer(blockId, answer, block): void }): () => void
```

## Licence

MIT. Icon geometry is Lucide, ISC -- see the repository LICENSE.
