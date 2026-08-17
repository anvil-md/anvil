# @anvil-md/marked

Render [ANVIL](https://github.com/anvil-md/anvil) fences through
[marked](https://marked.js.org).

```sh
bun add @anvil-md/marked
```

```ts
import { Marked } from 'marked'
import { anvilMarked } from '@anvil-md/marked'
import '@anvil-md/render-html/anvil.css'

const marked = new Marked()
marked.use(anvilMarked())

marked.parse(assistantMessage)
```

## Why marked gets the best integration

marked's `code` token carries **`raw`** -- the original source including the
fence delimiters. That is the only place the streaming state survives a markdown
parse, so this is one of the few integrations that can tell a finished fence from
one still being typed, without help from the host.

Everything else (`remark`, `markdown-it`) throws the delimiters away, and has to
be told.

`isFenceClosed` is exported if you want that check for something else.

## Options

| Option | Default | What |
|---|---|---|
| `lang` | `'anvil'` | Fence language to claim |
| `closed` | `isFenceClosed` | `(token) => boolean`. Pass `() => true` when re-rendering completed messages to skip the regex. |

## If you already own `renderer.code`

```ts
import { renderAnvilToken } from '@anvil-md/marked'

renderer.code = (token) => renderAnvilToken(token) ?? myNormalCodePath(token)
```

Returns `null` when the token is not an ANVIL fence, so it composes.

## Licence

MIT
