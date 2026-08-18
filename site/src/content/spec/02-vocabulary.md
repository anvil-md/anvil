---
title: "Vocabulary"
nav: "Vocabulary"
section: 2
summary: "Twelve blocks, two containers and one directive, why the set is closed, and why @markdown deliberately does not exist."
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
     @board     task rows grouped into lanes

   SHOW, until ask= (a record; with ask= it is an ASK block and stamps once)
     @card      one work item: subtasks, counted progress, status
     @message   a message an agent proposes to send

   LAYOUT (holds blocks, has no identity, cannot be answered)
     @grid      up to N columns, collapsing on the container
     @stack     one column, controlled gap
     @end       closes the innermost container

   CONTROL
     @void      retract an unanswered block the conversation moved past
```

Thirteen blocks, two containers and one directive. The set is **closed on
purpose**. Almost everything an implementer is tempted to add (`@confirm`,
`@yesno`, `@palette`, `@rate`, `@multi`, `@markdown`) is one of these with an
attribute set.

**The set splits on what the human sees, not on what the data is.** That line
has been here since the beginning -- `@choice` and `@gallery` hold identical
rows and differ only in how they are drawn -- and it is the test a new block
has to pass. `@board` is `@card`'s rows in lanes, and it earns a name for the
same reason `@gallery` does: lanes and a checklist are two different things to
look at, and an attribute that silently changes what a block *is* on screen is
harder to read than a second name.

`@card` passes a stronger test than that. A work item drawn as a `@note` full
of markdown has a progress number the agent typed by hand, and a number typed
by hand is a number that can disagree with the list underneath it. A block that
**counts** cannot.

Two blocks change category on an attribute, and both say so out loud: `@card`
and `@message` are records until `ask=` turns them into questions. Nothing else
in the set does this, and nothing else should.

`@markdown` in particular does not exist and should not be added: it would be
`@note` with different escaping. `@note` renders markdown. `@code lang=markdown`
is a third thing again -- *show* markdown source rather than *render* it -- so the
two are deliberately not aliased.
