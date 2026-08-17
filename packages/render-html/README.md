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

## Display only

**The emitted controls carry `disabled`.** This package draws a block; it does
not run one. Stamping -- the answer half of the spec -- is not implemented here.

That is a real limitation, not a temporary omission in disguise: implementing
stamping correctly needs server-held state, idempotency and a permission model,
which do not belong in a rendering package.
[§6](https://github.com/anvil-md/anvil/blob/main/SPEC.md#6-the-stamp) and
[§7](https://github.com/anvil-md/anvil/blob/main/SPEC.md#7-stamp-lifecycle) of
the spec are the contract if you are building it.

Disabled controls are styled to look normal rather than dimmed, so a rendered
block reads as the real thing rather than as a broken form.

## Blocks covered

`@choice`, `@gallery` (`image` / `swatch` / `type` / `card`), `@input` (all eight
field types), `@scale`, `@note` (three tones).

Specified but not yet rendered here: `@upload`, `@link`, `@order`, `@example`,
`@code`, `@void`. An unknown block degrades to a warned note rather than
vanishing, so a fence using one is still legible.

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
function renderAnvilFence(source: string, closed: boolean): string
function esc(s: string): string
function icon(name: IconName): string
function resolveIcon(requested: unknown, fallback: IconName): IconName
```

## Licence

MIT. Icon geometry is Lucide, ISC -- see the repository LICENSE.
