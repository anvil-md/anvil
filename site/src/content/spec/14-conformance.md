---
title: "Conformance"
nav: "Conformance"
section: 14
summary: "The ten things an implementation must do to call itself ANVIL v1 conformant."
---

An implementation is **ANVIL v1 conformant** if:

1. `parse` never throws, for any input, including every prefix of every fixture.
2. Unknown kinds, sigils, attributes and field types degrade with a warning
   rather than being dropped silently or throwing.
3. Derived ids depend only on content.
4. Blocks render inert while the fence is incomplete.
5. `swatch`, `font`, `img` and `min` are allowlisted; everything else is escaped.
6. If it implements stamping: the five laws hold, stamps are idempotent on
   `(blockId, nonce)`, and expiry is enforced server-side.
7. If it delivers stamps to a model: they are framed as untrusted data.
8. Every number a `@card` or `@board` draws is counted from its rows. No
   attribute can set, override or contradict one.
9. A `@card` renders as a snapshot and never refreshes itself, and subtask
   detail is reachable without a pointer.
10. Layout collapses against its container, has no id, and never renders an
    interactive affordance of any kind.

Reference implementation: [`packages/parser`](./packages/parser) and
[`packages/render-html`](./packages/render-html).
