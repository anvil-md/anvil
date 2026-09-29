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

**8.2.1 A viewer who cannot answer is told who can.**

A shared transcript puts the same open block in front of people with different
permissions. For the ones who cannot stamp it, a row of disabled buttons with no
reason attached reads as a broken widget, and they will report it, retry it, or
ask the agent why it is stuck. So the block keeps its full height (§9.2), keeps
its controls drawn and disabled, and carries one line saying who it is waiting
on:

```
   waiting on an org admin
```

**The host writes that line, never the agent.** There is no `to=` on an ASK
block and there must not be one. The server already knows who may stamp,
because it enforces exactly that on the write, and the line is read off the same
rule. An agent-authored "only Ana can answer this" is a claim nobody checks. The
day it disagrees with the real gate, the transcript tells one person to wait for
somebody who cannot answer either.

A viewer who *can* stamp sees no such line. Telling someone the block waits on
them is the prompt, restated.

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

**8.3.1 A brand mark is not one of these, and cannot be.**

The three rules above all ask the same question: could this string escape the
attribute it lands in? A `@connect` provider mark defeats that question, because
a perfectly well-formed `https://` URL beside the words "Connect Google" and a
button is already the attack. There is no lexical rule that separates a real
logo from a convincing one.

So `@connect` takes no `img=` (§4.18.5). The mark is chosen by the **host**, from
a list keyed by `provider=`, and an unrecognised provider gets a neutral mark and
a warning rather than a borrowed one. This is the only place in the language
where an allowlist covers *which value may be used* rather than *what shape it
must have*, and the reason is that the shape was never the risk.
