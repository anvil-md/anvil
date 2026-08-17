---
title: "The stamp"
nav: "The stamp"
section: 6
summary: "The answer half: the <stamp> tag, its payload per block kind, and why it renders as the frozen block rather than a second bubble."
---

### 6.1 Shape

```xml
<stamp block="…" kind="…" [payload attributes…]>
  [optional child elements]
  A sentence a human would have typed.
</stamp>
```

- **Attributes are the truth.** Parse those.
- **The body is the courtesy.**
- One tag per block; several answered blocks means several tags, in touch order.
- The client writes it. The agent never does.

Named `<stamp>` and **not** `<input>`: `<input>` collides with a real HTML
element, which a renderer or a model could plausibly confuse.

### 6.2 Per block

```xml
<!-- @choice select=one -->
<stamp block="project-kind" kind="choice" value="product" label="Product UI">
It is a product UI.
</stamp>

<!-- @choice / @gallery select=many -->
<stamp block="mood" kind="gallery" values="ed,br" labels="Editorial,Brutal">
I picked Editorial and Brutal.
</stamp>

<!-- @input -- note the masked secret -->
<stamp block="company" kind="input">
  <field name="legal">Acme Ltd</field>
  <field name="token">••••••</field>
I filled in the company details.
</stamp>

<!-- @upload -- files are ALSO attached to this turn as real parts -->
<stamp block="assets" kind="upload" count="2">
  <file name="brandbook.pdf" mime="application/pdf" size="2451920" pages="48" ref="blob_7f3ac91"/>
  <file name="logo.svg" mime="image/svg+xml" size="14204" ref="blob_c02de5"/>
I uploaded the brand book and the logo.
</stamp>

<!-- @link -->
<stamp block="refs" kind="link" count="1">
  <url href="https://example.com" fetched="yes" title="Example" desc="…"/>
These are the ones.
</stamp>

<!-- @scale -->
<stamp block="tone" kind="scale" steps="5">
  <dial name="formal" value="2" norm="0.25" poles="Formal|Playful"/>
</stamp>

<!-- @order -->
<stamp block="priorities" kind="order" values="craft,speed,cost">
Craft, then speed, then cost.
</stamp>

<!-- skipped / expired -->
<stamp block="refs" kind="link" skipped="yes">Skipped that one.</stamp>
<stamp block="mood" kind="gallery" expired="yes">That one timed out.</stamp>
```

Every tag may also carry `at=` and, where more than one human can act, `by=`.
Always include `label`/`labels` alongside `value`/`values` -- whoever summarises
this conversation later will not remember what `br` meant.

Use **one serializer** for all of this. One escaping policy, one place to fix it
when a label contains a quote. Every block hand-rolling its own tag is a future
escaping bug.

### 6.3 It renders as the stamp, not as a bubble

The tag is a real user turn in the model's context. In the **UI** it renders as
the stamped block, and nowhere else. A duplicate "you chose Editorial" bubble is
noise, and worse, it separates the answer from the question it answered.

### 6.4 Free text still works

The composer never goes away. A human who ignores a block and types prose has
answered it. **Design every block so that "never answered" is survivable** --
most of them will not be. That is what `@void` is for.
