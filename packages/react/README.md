# @anvil-md/react

[ANVIL](https://github.com/anvil-md/anvil) blocks as a React component.

```sh
bun add @anvil-md/react
```

```tsx
import { Anvil } from '@anvil-md/react'
import '@anvil-md/render-html/anvil.css'

<Anvil source={fenceBody} closed={!isStreaming} />
```

## With react-markdown

```tsx
import ReactMarkdown from 'react-markdown'
import { anvilCode } from '@anvil-md/react'

<ReactMarkdown components={{ code: anvilCode() }}>{message}</ReactMarkdown>
```

**Caveat, and it is real:** by the time react-markdown hands you a node, the
fence delimiters are gone, so this cannot tell a finished fence from a streaming
one. It assumes complete. Pass `closed` from whatever your app knows about the
message, or a block can become clickable before its last option has arrived --
which is how someone answers a question they have not finished reading.

## On `dangerouslySetInnerHTML`

This component uses it, deliberately, and it is safe here for a specific reason
rather than by hope.

`@anvil-md/render-html` builds its output string itself. It never interpolates
agent text into markup unescaped:

- prompts, labels, hints and placeholders are HTML-escaped;
- the three values that land in **attribute position** (`swatch`, `font`, `img`)
  are **allowlisted** -- hex only, conservative family names, `http(s)` only --
  because escaping is not sufficient inside a `style` or `src` attribute. A value
  that fails is dropped rather than escaped.

Both behaviours are covered by tests in the renderer package.

What this does not do is sanitise arbitrary HTML, because it never receives any:
the input is ANVIL source, not markup.

## Licence

MIT
