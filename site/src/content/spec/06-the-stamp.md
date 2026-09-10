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

<!-- @card ask= -- value is the task REF, because that is the stable handle -->
<stamp block="ANV-114" kind="card" value="ANV-120" label="Runbook entry">
Pick up the runbook entry next.
</stamp>

<!-- @message ask= -- the send gate. The stamp says APPROVED, never `sent`. -->
<stamp block="intro-mail" kind="message" channel="email" value="send" state="approved" at="14:04:20" by="Ana">
Yes, send it.
</stamp>
<stamp block="intro-mail" kind="message" channel="email" value="hold" state="declined">
Not yet.
</stamp>

<!-- the outcome, written by the HOST afterwards. Not a second stamp. -->
<sent block="intro-mail" state="sent" at="14:04:23"/>
<sent block="intro-mail" state="failed" at="14:04:23" error="550 mailbox unavailable"/>

<!-- @connect -- one stamp, written when the consent screen ANSWERS. The
     refused scopes are named: an agent that reads only `state` will try to
     write to a Drive it was denied write access to. -->
<stamp block="gdrive" kind="connect" state="connected" provider="google-drive"
       values="drive.readonly,drive.metadata" labels="Read your files,See file names"
       at="14:02" by="Jonas">
I connected Google Drive.
</stamp>
<stamp block="gdrive" kind="connect" state="partial" provider="google-drive"
       values="drive.readonly,drive.metadata" refused="drive.file" at="14:02" by="Jonas">
I connected Google Drive, but not with write access.
</stamp>
<stamp block="gdrive" kind="connect" state="declined" provider="google-drive">
I would rather not connect that.
</stamp>

<!-- skipped / expired -->
<stamp block="refs" kind="link" skipped="yes">Skipped that one.</stamp>
<stamp block="mood" kind="gallery" expired="yes">That one timed out.</stamp>
```

A card stamps its task **`ref`**, never the label: the ref is what survives
somebody rewording a subtask. A message stamps `send` or `hold` and nothing
else -- the body is already in the transcript above it, and repeating it in the
tag gives an escaping bug somewhere to live.

**The stamp never says `sent`.** It says `approved`, because that is the only
thing the click proves (§4.15.5). The outcome arrives afterwards as a separate
`<sent>` tag written by the **host**, once, terminally. An agent that writes
`state="sent"` is claiming a delivery it did not witness.

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
