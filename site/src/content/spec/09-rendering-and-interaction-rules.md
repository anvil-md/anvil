---
title: "Rendering and interaction rules"
nav: "Rendering"
section: 9
summary: "Twelve interaction rules, each of which has cost someone a bug: focus, height, motion, keyboard, semantics, mobile."
---

Each of these has cost someone a bug.

1. **Never autofocus.** The composer owns the caret. An inline block that grabs
   focus eats the sentence the human was typing.
2. **Height must not change on stamp.** Reserve the space. A block shrinking
   three screens up yanks the scroll position out from under the reader.
3. **No layout animation.** Opacity and colour only; drop even those under
   `prefers-reduced-motion`.
4. **Reserve image space before load.** A gallery that pops in at natural height
   reflows the whole page.
5. **Icons are vectors, never glyphs.** A text icon falls out of the host's font
   stack into a fallback and draws a tofu box.
6. **Number keys 1-9** select when focused; `Enter` submits; arrows drive
   `@scale`; `Escape` does nothing -- there is nothing to dismiss, and people
   press it reflexively.
7. **Real `<button>` elements.** `select=one` is a `role="radiogroup"`,
   `select=many` a `<fieldset>` of checkboxes.
8. **Stamped leaves the tab order** but stays readable to a screen reader.
9. **Full width of the message, not the viewport.** A block is part of a message.
10. **Mobile:** 44px hit targets, hints wrap rather than truncate, galleries go
    two-up, `@upload` offers the camera.
11. **Drag is never the only path.**
12. **Single-select never gets a submit button.** The click is the answer; a
    button would be a second, meaningless step.
