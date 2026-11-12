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
13. **Every block has a name for assistive technology**, inferred from what is
    on screen and replaceable by the agent (§9.13).

#### 9.13 Accessibility

A block already says what it is in visible text, and a renderer derives its
accessibility from there without the agent typing anything: the `?` prompt is
the accessible name and the `:` subtext the description. Four common
attributes cover the cases where the visible text is not enough, and an
authored value always replaces the inferred one:

```anvil
@chart id=signups render=spark alt="Signups doubled since March" desc="Monthly signups, January to June"
? Signups
- Jan | 310
- Feb | 295
- Mar | 320
- Apr | 410
- May | 530
- Jun | 640
```

| Attribute | On | Means |
|---|---|---|
| `alt=` | any block | the accessible name, replacing the prompt |
| `desc=` | any block | the accessible description, replacing the subtext |
| `live=off\|polite\|assertive` | any block | whether the block's ARRIVAL is announced |
| `decorative` | a block that asks nothing | hidden from assistive technology |
| `alt=` cell | an option row | the row's name, replacing its label; the alt text of an `img=`, the name of a `swatch=` |

`live=` is about arrival. Blocks never change after they are drawn, but a
transcript keeps adding them, and a screen reader user hears none of it unless
something says so. One case is inferred: a `@note tone=danger` arrives
`assertive`, because "production is down" found by scrolling is found too
late. Everything else is `off` unless the agent says otherwise; a transcript
that announces every block is a transcript a screen reader user mutes.

`decorative` is refused on any block that asks, and on a `@grid` or `@stack`,
with a warning. A question hidden from a screen reader is a question only
sighted people can answer, while the agent waits on everybody.

A renderer sets an explicit label only when one was authored. Restating the
prompt as an `aria-label` makes a screen reader say it twice. Swatches carry no
meaning read aloud, so a swatch row without `alt=` keeps its chips out of the
accessibility tree and lets the label name the card.
