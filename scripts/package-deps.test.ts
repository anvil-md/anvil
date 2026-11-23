/**
 * Every package a published package imports is declared in its package.json.
 *
 * Inside this repo a missing declaration is invisible: tsconfig `paths` and
 * Bun resolve `@anvil-md/parser` from source whatever the manifest says. On
 * npm it is a crash at import time. `@anvil-md/lint` imported the parser for
 * three months without declaring it, and nothing here could notice.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

const root = new URL('..', import.meta.url).pathname

interface Manifest {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** `react/jsx-runtime` is the package `react`; `@scope/name/sub` is `@scope/name`. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

/** Bare specifiers a package's shipped source imports at runtime or for its types. */
async function importsOf(dir: string): Promise<Set<string>> {
  const found = new Set<string>()
  const files = new Glob('src/**/*.{ts,tsx}').scanSync(dir)
  for (const file of files) {
    if (/\.test\.tsx?$/.test(file)) continue
    const text = await Bun.file(`${dir}/${file}`).text()
    // Code, not the usage examples inside doc comments.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? ''
      if (spec.startsWith('.') || spec.startsWith('node:') || spec === 'bun' || spec.startsWith('bun:')) continue
      found.add(packageOf(spec))
    }
  }
  return found
}

const manifests = [...new Glob('packages/*/package.json').scanSync(root)].sort()

describe('published packages declare what they import', () => {
  for (const path of manifests) {
    const dir = `${root}${path.replace(/\/package\.json$/, '')}`
    test(path, async () => {
      const pkg = (await Bun.file(`${root}${path}`).json()) as Manifest
      const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})])
      const missing = [...(await importsOf(dir))].filter(name => !declared.has(name))
      expect({ package: pkg.name, missing }).toEqual({ package: pkg.name, missing: [] })
    })
  }
})
