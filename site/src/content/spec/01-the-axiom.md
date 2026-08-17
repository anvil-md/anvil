---
title: "The axiom"
nav: "The axiom"
section: 1
summary: "One sentence about append-only transcripts, from which every other rule in this document follows."
---

> A conversation transcript is an append-only record of things that happened.\
> A widget that can be re-answered turns that record into a lie.

Every rule below falls out of that sentence.

| ANVIL is | ANVIL is not |
|---|---|
| Rich UI rendered **inside** a message | A modal, drawer, overlay or popover |
| Answered exactly once, then frozen in place | A form you can revise |
| Compiled to text on the way up | An event stream you subscribe to |
| A closed set of blocks | An extensible widget framework |
| Authored by an LLM mid-sentence, no escaping pain | JSON you have to serialise carefully |

If you want a back-button, a re-open, a live-updating value, or a block that
mutates after it is drawn, ANVIL is the wrong tool. Its entire value is that a
transcript containing ANVIL blocks reads truthfully after the fact.
