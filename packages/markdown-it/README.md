# @anvil-md/markdown-it

Render [ANVIL](https://github.com/anvil-md/anvil) fences through
[markdown-it](https://github.com/markdown-it/markdown-it).

```sh
bun add @anvil-md/markdown-it
```

```ts
import MarkdownIt from 'markdown-it'
import { anvilMarkdownIt } from '@anvil-md/markdown-it'
import '@anvil-md/render-html/anvil.css'

const md = new MarkdownIt().use(anvilMarkdownIt())
md.render(assistantMessage)
```

It overrides the `fence` rule and delegates every non-ANVIL fence back to
whatever renderer was there before, so it composes with highlight plugins.

## Streaming

markdown-it's fence token carries `info` and `content` but **not** the raw
delimiters, so this integration cannot detect a still-streaming fence. It assumes
complete. Pass `closed` if your host knows better:

```ts
md.use(anvilMarkdownIt({ closed: () => !isStreaming }))
```

## Licence

MIT
