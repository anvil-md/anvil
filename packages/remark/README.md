# @anvil-md/remark

A [remark](https://remark.js.org) plugin that renders
[ANVIL](https://github.com/anvil-md/anvil) fences.

> **Experimental.** Exercised against `remark-html` only. If you wire it into a
> different pipeline and it misbehaves, that is a real bug, not misuse -- please
> file it.

```sh
bun add @anvil-md/remark
```

```ts
import { remark } from 'remark'
import html from 'remark-html'
import { anvilRemark } from '@anvil-md/remark'

const out = await remark()
  .use(anvilRemark())
  .use(html, { sanitize: false })
  .process(message)
```

This is the highest-leverage integration in principle -- remark is the parser
under react-markdown, MDX, Astro, Docusaurus and most of unified -- and the one
with the sharpest caveats.

## Two things that will bite you

**1. It emits a raw `html` node.** Pipelines that strip raw HTML will drop it
silently. With `remark-rehype` you need:

```ts
.use(remarkRehype, { allowDangerousHtml: true })
.use(rehypeRaw)
```

**2. Streaming state is unrecoverable here.** By the time remark has produced an
mdast, the fence delimiters are gone. It assumes complete; pass `closed: false`
while a message is still arriving.

If you are on marked, use [`@anvil-md/marked`](../marked) instead -- it can
detect the streaming state on its own.

## Licence

MIT
