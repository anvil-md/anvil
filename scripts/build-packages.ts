/**
 * Build the published form of every @anvil-md package: `dist/*.js` and
 * `dist/*.d.ts`.
 *
 * Inside this repo nothing reads `dist/`. tsconfig `paths` and Bun resolve every
 * `@anvil-md/*` import from source, so tests, typecheck and the site never need
 * a build. `dist/` exists for the people who install from npm:
 *
 * - **JS, not TypeScript.** Shipping `src/index.ts` as the entry works in a
 *   bundler and nowhere else: plain `node` cannot load it, and every consumer
 *   would typecheck our source under THEIR compiler options.
 * - **One bundled file per entry.** The source imports `./parse` with no
 *   extension, which Node's ESM resolver refuses. Bundling the relative imports
 *   away removes the question; `@anvil-md/*` and React stay external.
 * - **Declarations from tsc**, with the same extensionless specifiers rewritten
 *   to `./parse.js` so a `moduleResolution: node16` consumer resolves them.
 *
 *   bun scripts/build-packages.ts            # every package, dependency order
 *   bun scripts/build-packages.ts parser     # one (its deps must be built)
 */
import { $ } from 'bun'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'

const root = new URL('..', import.meta.url).pathname

interface Spec {
  /** dist name -> source entry, relative to the package. */
  entries: Record<string, string>
  /** Bun's target: `bun` only where the code calls Bun APIs. */
  target: 'node' | 'bun'
}

/** Dependency order: a package's @anvil-md deps are always built before it. */
export const PACKAGES: Record<string, Spec> = {
  parser: { entries: { index: 'src/index.ts' }, target: 'node' },
  conformance: { entries: { index: 'src/index.ts' }, target: 'node' },
  // The hydrator is its own entry: a server rendering strings never loads DOM code.
  'render-html': { entries: { index: 'src/index.ts', hydrate: 'src/hydrate.ts' }, target: 'node' },
  lint: { entries: { index: 'src/index.ts', cli: 'src/cli.ts' }, target: 'bun' },
  a2ui: { entries: { index: 'src/index.ts' }, target: 'node' },
  marked: { entries: { index: 'src/index.ts' }, target: 'node' },
  'markdown-it': { entries: { index: 'src/index.ts' }, target: 'node' },
  remark: { entries: { index: 'src/index.ts' }, target: 'node' },
  react: { entries: { index: 'src/index.tsx' }, target: 'node' },
}

/** NOT `.build/`: that is SwiftPM's build directory, and this script deletes its temp dir. */
const TMP = `${root}.tsbuild`

const EXTERNAL =['@anvil-md/*', 'react', 'react/*', 'react-dom', 'react-dom/*']

/** Each @anvil-md package's built declarations, so tsc never walks a sibling's source. */
const DECLARED_PATHS = Object.fromEntries(
  Object.keys(PACKAGES).map(name => [`@anvil-md/${name}`, [`${root}packages/${name}/dist/index.d.ts`]]),
)

async function bundle(dir: string, spec: Spec): Promise<void> {
  const result = await Bun.build({
    entrypoints: Object.values(spec.entries).map(e => `${dir}/${e}`),
    outdir: `${dir}/dist`,
    root: `${dir}/src`,
    format: 'esm',
    target: spec.target,
    external: EXTERNAL,
    sourcemap: 'linked',
    naming: '[name].js',
    // Without this the React package imports `react/jsx-dev-runtime`, and every
    // production consumer ships React's development JSX path.
    jsx: { development: false },
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`build-packages: bundling ${dir} failed`)
  }
}

async function declare(name: string, dir: string, spec: Spec): Promise<void> {
  const config = {
    compilerOptions: {
      declaration: true,
      emitDeclarationOnly: true,
      outDir: `${dir}/dist`,
      rootDir: `${dir}/src`,
      target: 'ESNext',
      module: 'Preserve',
      moduleResolution: 'bundler',
      lib: ['ESNext', 'DOM'],
      types: ['bun'],
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      verbatimModuleSyntax: true,
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      paths: Object.fromEntries(Object.entries(DECLARED_PATHS).filter(([pkg]) => pkg !== `@anvil-md/${name}`)),
    },
    files: Object.values(spec.entries).map(e => `${dir}/${e}`),
  }
  await mkdir(TMP, { recursive: true })
  const path = `${TMP}/tsconfig.${name}.json`
  await Bun.write(path, JSON.stringify(config, null, 2))
  await $`bunx tsc -p ${path}`.cwd(root)
  await fixSpecifiers(`${dir}/dist`)
}

/** `from './parse'` -> `from './parse.js'`, or `./icons/index.js` for a directory. */
async function fixSpecifiers(dist: string): Promise<void> {
  for (const file of new Bun.Glob('**/*.d.ts').scanSync(dist)) {
    const path = `${dist}/${file}`
    const here = path.slice(0, path.lastIndexOf('/'))
    const text = await Bun.file(path).text()
    const fixed = text.replace(/(from\s+|import\()(['"])(\.{1,2}\/[^'"]+)\2/g, (all, lead, q, spec: string) => {
      if (/\.(js|json)$/.test(spec)) return all
      const bare = spec.replace(/\.tsx?$/, '')
      if (existsSync(`${here}/${bare}.d.ts`)) return `${lead}${q}${bare}.js${q}`
      if (existsSync(`${here}/${bare}/index.d.ts`)) return `${lead}${q}${bare}/index.js${q}`
      return all
    })
    if (fixed !== text) await Bun.write(path, fixed)
  }
}

export async function build(name: string): Promise<void> {
  const spec = PACKAGES[name]
  if (!spec) throw new Error(`build-packages: ${name} is not a published package`)
  const dir = `${root}packages/${name}`
  await rm(`${dir}/dist`, { recursive: true, force: true })
  await bundle(dir, spec)
  await declare(name, dir, spec)
  // MIT asks for the notice to travel with the code, and npm only packs a
  // LICENSE that sits in the package directory. Gitignored; the root one is the source.
  await Bun.write(`${dir}/LICENSE`, Bun.file(`${root}LICENSE`))
  console.log(`built @anvil-md/${name}`)
}

if (import.meta.main) {
  const wanted = Bun.argv.slice(2)
  for (const name of wanted.length ? wanted : Object.keys(PACKAGES)) await build(name)
  await rm(TMP, { recursive: true, force: true })
}
