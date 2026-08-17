---
title: "Vocabulary"
nav: "Vocabulary"
section: 2
summary: "The ten blocks and one directive, why the set is closed, and why @markdown deliberately does not exist."
---

```
   ASK  (produce a <stamp>, then freeze)
     @choice    one-of-N or many-of-N, text rows
     @gallery   the same, but visual: images, swatches, typefaces, cards
     @input     typed fields
     @upload    file drop. Real attachments, not links.
     @link      paste a URL, get a fetched preview card
     @scale     one or more sliders between two named poles
     @order     drag N items into a ranking

   SHOW (never produce a stamp, never freeze)
     @note      prose, hints, warnings. Body is markdown.
     @code      a verbatim literal, inside the block
     @example   a canned value that fills an ASK block

   CONTROL
     @void      retract an unanswered block the conversation moved past
```

Ten blocks and one directive. The set is **closed on purpose**. Almost everything
an implementer is tempted to add (`@confirm`, `@yesno`, `@palette`, `@rate`,
`@multi`, `@markdown`) is one of these with an attribute set.

`@markdown` in particular does not exist and should not be added: it would be
`@note` with different escaping. `@note` renders markdown. `@code lang=markdown`
is a third thing again -- *show* markdown source rather than *render* it -- so the
two are deliberately not aliased.
