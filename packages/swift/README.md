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
| **Block model** -- kinds, ids, derived ids, prompts, options, chart data, flow edges, domain | **38 / 38** |
| **Warnings** -- `warningsContain` | **17 / 17** |

`AnvilParser.parse` has no throwing path at all, so totality is enforced by the
type system rather than by discipline. That is the rule CLAUDE.md cares about
most and it is met by construction.

## Stamps

The answer half of SPEC 6 and 7, which the TypeScript packages do not have yet.

```swift
let stamp = AnvilAnswer.choice(option).stamp(for: block, at: .now, by: "Ana")
send(stamp.xml)                                  // the one serializer (6.2)

let read = AnvilStamp.read(humanTurnText)        // stamps back out of a turn
let transcript = AnvilTranscript(turns)          // first stamp per block wins
transcript.ledger["deploy"]?.stamp               // decided, frozen
transcript.ledger["deploy"]?.refused             // later ones, kept and inert
```

Tested against SPEC 6.2's own literals (`StampSerializerTests`). Derived ids
are the reference parser's, hash for hash (`DerivedIdTests`), because the id
is the `block=` another client's stamp will carry.

### What is not covered

The corpus's `html*` keys name substrings the reference renderer must emit.
They are a renderer's contract, not a parser's, and this package draws nothing.

Some `blocks` keys are decoded and NOT asserted yet: `taskStates`, `taskRefs`,
`taskLabels`, `taskMeta`, `taskDetails`, `taskRollups`, `progress`, `meta`,
`nodeIds`, `nodeStates`, `ranks`, `backEdges` and `domain.zeroPct`. The
38 / 38 above is 38 of the cases that pin a block model, judged on the keys
listed in its row -- not every key those cases pin. `derivedId` was in this
list until 2026-09-23, and the ids were wrong the whole time it was.

`tree`, `topLevelKinds` and `maxDepth` are parsed -- containers nest and the
depth cap is enforced -- but are not yet asserted here, because no case pins
them without also pinning html.

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
