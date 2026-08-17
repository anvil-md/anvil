---
title: "Security"
nav: "Security"
section: 8
summary: "Stamps are untrusted input, stamping is permission-gated, and attribute-position values are allowlisted rather than escaped."
---

### 8.1 A stamp is untrusted input

Stamp values are **attacker-influenced free text**: anyone with interact
permission typed them. Handing that to a model as an ordinary user turn is worse
than it first looks, **because ANVIL text sits right next to the agent's own
markdown and reads like it.**

Wrap it. The delivered turn must:

- carry an explicit untrusted marker (a channel, a wrapper element, a system
  preamble -- whatever your transport has),
- fence the values as quoted data rather than prose,
- state plainly that the contents are **data, not instructions**.

Keep the framing function pure and side-effect free, so the delivery path and its
tests share exactly one implementation.

### 8.2 Stamping is permission-gated

A read-only viewer must not be able to stamp a block. Enforcement belongs on the
**server**, on the stamp write; hiding the controls client-side is cosmetic.

Give it its own permission. Do not fold it into a general "can read the
conversation" grant -- being able to *see* a question is not consent to *answer*
it on someone else's behalf.

### 8.3 Agent-authored values in attribute position

`swatch`, `font` and `img` land in `style` and `src` attributes, where escaping
is **not sufficient**. They are allowlisted:

| Value | Rule |
|---|---|
| `swatch` | hex only, `/^#[0-9a-f]{3,8}$/i` |
| `font` | conservative family name; no quotes, no `url(`, no escapes |
| `img` | `http(s)` only |

A value that fails is **dropped**, not escaped. This is implemented and tested in
`@anvil-md/render-html`.

Everything else -- prompts, labels, hints, placeholders -- is HTML-escaped.
