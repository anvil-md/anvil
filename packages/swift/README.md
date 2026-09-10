# AnvilKit

ANVIL in Swift. Foundation only -- no SwiftUI, no UIKit, no AppKit. A parser has
no business knowing what a pixel is.

```swift
let document = AnvilParser.parse(source)
for block in document.blocks { ... }
for warning in document.warnings { ... }   // never ignore these
```

## Status against the corpus

Run it:

```sh
swift test
```

| What the corpus checks | State |
|---|---|
| **Totality** -- no throw on every prefix of every source | **77 / 77** |
| **Block model** -- `blocks`, kinds, ids, prompts, option values | **38 / 38** |
| **Warnings** -- `warningsContain` | **8 / 17** |

`AnvilParser.parse` has no throwing path at all, so totality is enforced by the
type system rather than by discipline. That is the rule CLAUDE.md cares about
most and it is met by construction.

### What is not done

Nine warning cases remain, and each needs a feature rather than a warning
string:

- **`@card` rollups (§4.12.1)** -- `3/7` counted off the rows, a `status=` that
  contradicts them, `more done than total`, and a rollup that needs a separator.
- **`@chart` domain (§4.16.2, §4.16.4)** -- a `max=` below the largest value, a
  `min=` above the smallest, a non-numeric value cell, and `values=` losing to
  the rows.
- **`@flow` edges (§4.17.2, §4.17.4)** -- an edge that points at itself, and
  counting what truncation dropped.

The block kinds those cases need -- chart data rows, flow nodes and edges, card
task rollups -- are parsed as ordinary options today. They do not crash and they
do not silently vanish, but they are not modelled.

## Why `Package.swift` is at the repository root

SwiftPM resolves a git dependency by cloning the repo and reading
`Package.swift` **at the root**. There is no subdirectory option -- no path
component in the URL form. So a Swift package inside a polyglot repo either
lives at the root or lives in a separate repo.

It lives here because **the corpus is the oracle**. A separate repo would let
the two drift, and a corpus case added on Monday with a Swift parser that has
never seen it is exactly the failure the corpus exists to prevent. One repo, one
commit, one truth.

The sources are under `packages/swift/`, matching every other implementation.

## Consuming it

```swift
.package(url: "https://github.com/anvil-md/anvil.git", from: "0.1.0")
```

Working on both sides at once, without editing `Package.swift`:

```sh
swift package edit AnvilKit --path ../anvil-md
```

Never use a relative `.package(path:)` that escapes the consuming repo's root --
it resolves against whoever happens to have checked out what, and breaks every
clone that does not match your disk.
