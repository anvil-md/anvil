/**
 * The release gate: pack every package exactly as npm would receive it, install
 * the tarballs into an empty project, and use each one from plain Node and from
 * a strict `node16` TypeScript consumer.
 *
 * Nothing inside this repo can see a broken package. tsconfig `paths` and Bun
 * resolve every `@anvil-md/*` import from source, so a missing dependency, a
 * `.ts` entry point or an extensionless import in a declaration passes every
 * test here and fails on the first `npm i`. This is the only check that looks
 * at what actually ships.
 *
 *   bun run pack:smoke        # leaves the tarballs in .pack/tgz
 *
 * Releasing: every package carries the git tag's version. Bump all nine, run
 * `bun run check && bun run pack:smoke`, tag, then publish THESE tarballs --
 * the bytes this gate tested -- dependencies first, in `PACKAGES` order:
 *
 *   for t in parser conformance render-html lint a2ui marked markdown-it remark react; do
 *     npm publish .pack/tgz/anvil-md-$t-<version>.tgz --access public
 *   done
 */
import { $ } from 'bun'
import { mkdir, rm } from 'node:fs/promises'
import { build, PACKAGES } from './build-packages'

const root = new URL('..', import.meta.url).pathname
const out = `${root}.pack`
const app = `${out}/app`

await rm(out, { recursive: true, force: true })
await mkdir(`${out}/tgz`, { recursive: true })
await mkdir(app, { recursive: true })

// Build HERE, every time. `bun pm pack` does not run `prepack` (checked on Bun
// 1.4.4: dist/ kept its old mtime), and packing a stale dist/ is how the first
// run of this gate checked yesterday's declarations.
for (const name of Object.keys(PACKAGES)) await build(name)

const tarballs: Record<string, string> = {}
for (const name of Object.keys(PACKAGES)) {
  // `bun pm pack` rewrites `workspace:*` to the exact sibling version.
  const log = await $`bun pm pack --destination ${out}/tgz --quiet`.cwd(`${root}packages/${name}`).text()
  const file = log.trim().split('\n').pop() ?? ''
  tarballs[`@anvil-md/${name}`] = `file:${file.startsWith('/') ? file : `${out}/tgz/${file.split('/').pop()}`}`
  console.log(`packed @anvil-md/${name}`)
}

await Bun.write(
  `${app}/package.json`,
  JSON.stringify(
    {
      name: 'anvil-smoke',
      private: true,
      type: 'module',
      dependencies: {
        ...tarballs,
        react: '^19',
        'react-dom': '^19',
        marked: '^16',
        'markdown-it': '^14',
        typescript: '^5.7',
        '@types/node': '^22',
        '@types/react': '^19',
        '@types/react-dom': '^19',
        '@types/markdown-it': '^14',
      },
      // The tarballs depend on each other by version; point those at the files too.
      overrides: tarballs,
    },
    null,
    2,
  ),
)
await $`npm install --no-audit --no-fund --loglevel=error`.cwd(app)

const FENCE = '@choice id=db select=one\\n? Which database?\\n- sqlite | SQLite\\n- pg | Postgres'

/** Every package, used for real from plain Node: one line each, one throw fails the gate. */
await Bun.write(
  `${app}/smoke.mjs`,
  `
import assert from 'node:assert/strict'
import { parseAnvil, stampAnswer, stampXml } from '@anvil-md/parser'
import { renderAnvilFence } from '@anvil-md/render-html'
import { anvilMarked } from '@anvil-md/marked'
import { anvilMarkdownIt } from '@anvil-md/markdown-it'
import { anvilRemark } from '@anvil-md/remark'
import { Anvil } from '@anvil-md/react'
import { lint } from '@anvil-md/lint'
import { toA2UI } from '@anvil-md/a2ui'
import { cases } from '@anvil-md/conformance'
import { Marked } from 'marked'
import MarkdownIt from 'markdown-it'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const fence = '${FENCE}'
const doc = parseAnvil(fence)
assert.equal(doc.blocks[0].kind, 'choice')
const stamped = stampAnswer(doc.blocks[0], { kind: 'pick', values: ['pg'] })
assert.ok(stamped.ok && stampXml(stamped.stamp).includes('value="pg"'))
assert.match(renderAnvilFence(fence, true), /anvil-block/)
const md = '\`\`\`anvil\\n' + fence + '\\n\`\`\`\\n'
assert.match(await new Marked(anvilMarked()).parse(md), /anvil-block/)
assert.match(new MarkdownIt().use(anvilMarkdownIt()).render(md), /anvil-block/)
assert.equal(typeof anvilRemark(), 'function')
assert.match(renderToString(createElement(Anvil, { source: fence })), /anvil-block/)
assert.ok(lint(fence).ok)
assert.ok(toA2UI(fence).surfaces.length > 0)
assert.ok(cases().length > 0)
console.log('node: every package imports and runs')
`,
)
await $`node smoke.mjs`.cwd(app)

/** The declarations, under the strictest resolution a published package meets. */
await Bun.write(`${app}/smoke.mts`, await Bun.file(`${app}/smoke.mjs`).text())
await Bun.write(
  `${app}/tsconfig.json`,
  JSON.stringify({
    compilerOptions: {
      module: 'node16',
      moduleResolution: 'node16',
      target: 'es2022',
      strict: true,
      noEmit: true,
      // Off, because our declarations ARE library files here: skipLibCheck would skip the thing under test.
      skipLibCheck: false,
      types: ['node'],
      lib: ['es2022', 'dom'],
    },
    files: ['smoke.mts'],
  }),
)
await $`npx tsc -p .`.cwd(app)
console.log('tsc: declarations resolve under node16')

await $`bunx anvil-lint --help`.cwd(app).quiet()
console.log('bin: anvil-lint runs')
console.log(`\ntarballs ready in ${out}/tgz`)
