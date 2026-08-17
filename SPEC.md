# ANVIL -- specification v1

**A**gent-**N**ative **V**isual **I**nteraction **L**anguage.

A tiny line-oriented DSL that an LLM writes inside a fenced code block. A host
renders that fence as real UI **inline in the conversation**, instead of as a
code block. When a human touches it, the interaction compiles back to a
structured text tag the model reads as an ordinary turn.

> Status: v1. The parser and an HTML renderer are implemented
> ([`packages/`](./packages)). The answer half -- **stamping** -- is specified
> here but not yet implemented; §6 and §7 are the contract for anyone building
> it.

---

## 0. Sixty seconds

ANVIL has exactly two halves, and nothing in between.

````
   ┌──────────────────────────┐                ┌──────────────────────────┐
   │  DOWN: a fenced block    │                │  UP: a structured tag    │
   │  the agent writes        │  ─── human ──► │  the client writes text. │
   │  markdown. The host      │      clicks    │  The agent reads text.   │
   │  renders it as REAL UI.  │                │                          │
   └──────────────────────────┘                └──────────────────────────┘
              ```anvil                                   <stamp …>
````

Down, mid-sentence, in an ordinary assistant message:

````markdown
Nice. Which of these feels like you?

```anvil
@gallery id=mood select=many max=2
? Pick the ones that feel right
- ed | Editorial | dense, warm | img=https://example.com/ed.jpg
- sw | Swiss     | airy, cold  | img=https://example.com/sw.jpg
- br | Brutal    | loud, black | img=https://example.com/br.jpg
```
````

That renders as a row of clickable cards. The human picks two and confirms. The
cards **stamp**: the picked ones lift, the rest fade, permanently.

Up, into the model's context, as a plain user turn:

```xml
<stamp block="mood" kind="gallery" values="ed,br" labels="Editorial,Brutal">
I picked Editorial and Brutal.
</stamp>
```

**That tag is the entire integration.** No tool calls, no widget runtime, no
event bus reaching into the agent loop. The model emits markdown and reads text;
everything between is the host's problem.

The attributes are the truth. The sentence inside is the courtesy -- it exists so
the transcript still reads like a conversation months later, and so a model that
ignores the tag entirely still gets the gist.

---

## 1. The axiom

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

---

## 2. Vocabulary

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

---

## 3. Grammar

Line-oriented, one level of nesting, no lookahead. Leading whitespace is
insignificant.

### 3.1 Sigils

| Sigil | Means | Appears in |
|---|---|---|
| `@` | block header: `@kind key=value key="quoted value"` | starts every block |
| `?` | the prompt. Repeatable; lines join with a newline. | all |
| `:` | subtext / help, rendered smaller under the prompt | all |
| `-` | an option row | `@choice` `@gallery` `@order` |
| `_` | a field row | `@input` |
| `%` | a scale row | `@scale` |
| `=` | a prefill row: `field=value` | `@example` |
| `>` | prose line (markdown) | `@note` |
| `#` | comment. Parsed, never rendered, never sent. | anywhere |
| `~~~` | literal fence, opens and closes a verbatim body | `@code` `@example` |

A line beginning with none of the above is treated as prose and appended to the
current prompt. **This is deliberate**: an agent that forgets a sigil gets
slightly-wrong rendering, never a crash.

### 3.2 Shape

```ebnf
doc      = block+ ;
block    = header , line* ;
header   = "@" , kind , { ws , attr } , NL ;
attr     = key , [ "=" , ( bareword | quoted ) ] ;      (* bare attr = true *)
option   = "-" , [ "!" ] , value , { "|" , cell } , NL ;
cell     = label | hint | ( key , "=" , value ) ;       (* img= swatch= font= *)
field    = "_" , name , [ "*" ] , "|" , type , { "|" , cell } , NL ;
scale    = "%" , name , "|" , leftPole , "|" , rightPole , [ "|" , default ] , NL ;
literal  = "~~~" , NL , { any } , "~~~" , NL ;
```

Pipes are the only column separator. Pad them for readability; the parser trims.
A literal pipe inside a label is `\|`. Trailing `key=value` cells are unordered,
so `| img=… | Editorial |` and `| Editorial | img=…` are equivalent.

### 3.3 Why `~~~` and not backticks

An ANVIL fence is itself delimited by ` ``` `. **A backtick fence cannot nest
inside a backtick fence** without asking the model to count backticks correctly,
which is exactly the sort of thing that breaks mid-stream.

`~~~` is the in-block literal delimiter for that reason, and it is why `@code`
is a necessary block rather than sugar: a code sample that belongs *inside* a
block has no other way in, and content outside the fence is not part of the
block -- so it is not part of the frozen record either.

---

## 4. Blocks

Every ASK block shares these attributes:

| Attribute | Default | Meaning |
|---|---|---|
| `id` | derived (§8.2) | stable identity, and the `block=` in the stamp |
| `select` | `one` | `one` stamps on click. `many` gives checkboxes plus a submit. |
| `submit` | `"Confirm"` | button label |
| `icon` | per kind | override the block's icon |
| `min` `max` | -- | with `select=many`, bounds enforced before submit arms |
| `expires` | none | `30s` `15m` `2h`. Server-enforced (§7.5). |
| `optional` | off | a Skip affordance that still emits a stamp |
| `danger` | off | destructive framing plus a deliberate second click |
| `phrase` | -- | with `danger`: type this exact string to arm the button |

### 4.1 `@choice`

```anvil
@choice id=project-kind
? What are we actually building?
: If it is more than one, pick the one that pays for the others.
- site    | Marketing site     | pages, no login
- product | Product UI         | accounts, state, real users
- !scrap  | Start from scratch | we bin the existing brand
```

Prefix a value with `!` to mark that single row destructive.

```
   ╭─ ? What are we actually building? ─────────────────────────╮
   │  If it is more than one, pick the one that pays for the    │
   │  others.                                                   │
   │                                                            │
   │    [1]  Marketing site      pages, no login                │
   │    [2]  Product UI          accounts, state, real users    │
   │    [3]  Start from scratch  we bin the existing brand      │
   ╰────────────────────────────────────────────────────────────╯
```

Stamped, at **exactly the same height** (§9.2):

```
   ╭─ ? What are we actually building? ─────────────────────────╮
   │  If it is more than one, pick the one that pays for the    │
   │  others.                                                   │
   │                                                            │
   │         Marketing site      pages, no login                │
   │    ✓    Product UI          accounts, state, real users    │
   │         Start from scratch  we bin the existing brand      │
   ╰──────────────────────── stamped · Ana · 14:02:11 ──────────╯
```

**Never collapse a stamped choice to one line.** The rejected rows are part of
the record: they show what the human was choosing *between*.

### 4.2 `@gallery`

Same semantics as `@choice`, different renderer. `render=` picks the card body:

| `render` | Cell attribute | Card shows |
|---|---|---|
| `image` (default) | `img=<url>` | the image, 4:3, object-fit cover |
| `swatch` | `swatch=#a,#b,#c` | a colour strip |
| `type` | `font=<family>` `sample="Aa"` | the sample set in that family |
| `card` | -- | label and hint in a grid, no media |

```anvil
@gallery id=palette render=swatch select=one
? Which palette?
- ink  | Ink and paper | warm, printed | swatch=#111111,#f5f2ea,#c8452d
- volt | Volt          | loud, black   | swatch=#0a0a0a,#e6ff00,#8a8a8a
```

`img`, `swatch` and `font` land in `src` and `style` attributes, so they are
**allowlisted, not escaped** (§8.3). Fonts must be loaded before the card paints,
or the human judges the fallback face three times.

### 4.3 `@input`

```anvil
@input id=company submit="That's us"
? Tell me who you are
_ legal*  | text     | Legal name      | Acme Ltd
_ site    | url      | Current website | https://…
_ token   | secret   | API key
_ context | longtext | Anything I should know
```

Field row: `_ name[*] | type | Label | placeholder`. A trailing `*` on the name
means required. Label defaults to the name, title-cased.

| Type | Control |
|---|---|
| `text` | single-line input |
| `longtext` | textarea |
| `number` | numeric input |
| `bool` | a switch |
| `secret` | **masked**; the value never reaches the transcript (§7.6) |
| `path` | monospace text input |
| `url` | url input |
| `date` | native date picker |

### 4.4 `@code`

The only way to put a verbatim literal *inside* a block.

```anvil
@code lang=ts label="The handler"
~~~
export function handle(x: string) {
  return x.trim()
}
~~~
```

`lang=` drives highlighting; unknown or absent renders plain, never throws. No
sigil parsing happens inside the literal. An unclosed `~~~` closes at end of
fence, so the parser stays total.

### 4.5 `@note`

```anvil
@note tone=warn
> Staging shares the production database. **Migrations you run there are real.**
```

`tone` is `info` (default), `warn`, `danger`. No id, no interaction, no stamp.

The body is **markdown**. Two constraints come with that: reuse a markdown
configuration that escapes raw HTML (this is agent-authored text), and add a
recursion depth guard, because a note containing an ` ```anvil ` fence would
otherwise re-enter the renderer forever.

A note also carries its own parse warnings **inside** its tinted box. It has no
frame to hang them off, so a sibling warning would float naked in the page.

### 4.6 `@upload`

The one block that carries bytes.

```anvil
@upload id=assets accept="pdf,png,svg,zip" max=25mb multiple
? Send me anything you already have
: Logo files, a brand guide, screenshots. Ugly is fine.
```

**The rule that makes this useful instead of decorative:** an uploaded file must
be attached to the synthesised turn as a real attachment, in whatever form the
model transport already accepts. The stamp *names* it; the attachment *carries*
it. If a PDF arrives and the model cannot read it, the upload block is a lie.

Stamps on **submit**, not on drop (§7.4).

### 4.7 `@link`

```anvil
@link id=refs multiple submit="These are the ones"
? Anything out there you want this to feel like?
```

The host fetches a preview per URL and folds title and description into the
stamp, so the model gets the metadata **without spending a tool call**. A failed
fetch carries the bare URL and `fetched="no"` -- never block the human on someone
else's slow server. The fetcher takes arbitrary user URLs, so it needs the same
SSRF egress rules as any other server-side fetch.

### 4.8 `@scale`

```anvil
@scale id=tone steps=5
? Set the dials
% formal | Formal | Playful | 2
% dense  | Dense  | Airy    | 3
```

`% name | leftPole | rightPole | default`. `steps` (default 5, range 2-11) is the
notch count; the stamp reports both the notch and a normalised `0..1`.

The poles are what the human reads; `name` is the machine key. Reads well when
poles differ, ambiguously when they repeat.

### 4.9 `@order`

```anvil
@order id=priorities
? Drag these into the order you would actually defend
- speed | Ship fast
- craft | Get it exactly right
```

Up/down buttons alongside the drag, always. **Drag-only ranking is an
accessibility failure** and is unusable on touch.

### 4.10 `@example`

A loaded gun for an ASK block.

```anvil
@example id=ex-typical for=company label="Roughly this much detail"
= legal=Northbound Tooling Ltd
= site=https://northbound.example
```

- `Use this` fills the target and **nothing else**. No submit, no stamp, no tag.
  The human still presses the target's own button.
- Targeting a `@choice`/`@gallery` pre-selects rows without stamping them.
- **An example dies with its target.** The moment the target stamps, every
  example pointing at it goes read-only and the button disappears. A live "Use
  this" next to a frozen block is a lie about what is possible.
- A `for=` matching nothing renders read-only with a parse warning, never
  silently dropped.

### 4.11 `@void`

```anvil
@void id=mood reason="you described it in words instead"
```

Renders the target struck-through and inert. **This is not an unstamp** -- a
voided block can never be answered, it just stops pretending it can be.

Emit it the moment the conversation overtakes an unanswered block. A stale live
widget three screens up is the single most annoying failure mode of inline UI.

---

## 5. Streaming

An LLM emits a fence token by token, so **every prefix of a fence is a real
input** the renderer will see.

While the message is still arriving, every block renders **inert**. A block that
becomes clickable before its last option has streamed in is how someone answers a
question they have not finished reading.

Hosts detect this however their pipeline allows -- typically by checking whether
the closing fence delimiter has arrived. `parseAnvil(src, { partial: true })`
marks the document so the renderer can show it as provisional.

---

## 6. The stamp

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

---

## 7. Stamp lifecycle

### 7.1 The five laws

```
   ┌────────────────────────────────────────────────────────────────────┐
   │  I.    A click stamps the block, forever. There is no unstamp      │
   │        verb, in the DSL, in the API, or in the database.           │
   │                                                                    │
   │  II.   The stamp lives on the server, keyed by block id. What the  │
   │        client holds is a cache, and it is allowed to be wrong.     │
   │                                                                    │
   │  III.  One stamp per block id. The second is REFUSED, not queued   │
   │        and not overwritten.                                        │
   │                                                                    │
   │  IV.   A stamped block still renders in full -- the answer, the    │
   │        rejected options, who, and when. Never collapsed to text.   │
   │                                                                    │
   │  V.    To change an answer, the agent asks again in a NEW block.   │
   │        History is append-only.                                     │
   └────────────────────────────────────────────────────────────────────┘
```

### 7.2 State machine

```
                        ┌─────────┐
                        │  open   │
                        └────┬────┘
                             │
        ┌────────────────────┼────────────────────┐
        │ click              │ expires            │ @void
        ▼                    ▼                    ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ pending │          │ expired │          │  void   │
   └────┬────┘          └─────────┘          └─────────┘
        │                         ┌─────────┐
        ├── server ack ─────────► │ stamped │
        │                         └─────────┘
        │
        └── nak / timeout ──────►  back to open, with an error strip

   stamped, expired and void are ABSORBING. Nothing leaves them.
```

`pending` exists so a click feels instant on a bad connection: the chosen row
goes optimistic immediately, everything else disables, a spinner sits in the
footer. **Never optimistically render `stamped`** -- law II says the server
decides, and a stamp you have to take back is worse than a spinner.

### 7.3 Idempotency

Every submission carries `(blockId, nonce)`. The server keeps the **first**
record per `blockId` and returns that same record for every later attempt,
whatever the nonce. One stamp results from all four of:

- an impatient double-click,
- the same conversation open in two tabs,
- a websocket reconnect replaying its outbox,
- a retry after a timeout that had actually succeeded.

A losing attempt gets `409` plus the winning record, and the client renders the
winner. **Do not surface an error** -- the user's intent was satisfied.

### 7.4 Uploads

An upload block stamps on **submit**, not on drop. Bytes go to blob storage
first; the stamp and the tag land only once every file has a ref. A half-uploaded
file must never produce a tag, or the model gets a `ref` that 404s.

If one file of three fails, the block stays `open` with that row marked failed
and a retry on it. Partial success is not success.

### 7.5 Expiry is server-enforced

`expires=15m` greys the block client-side **and** is checked on the server. A
client with a wrong clock, or a tab asleep for six hours, must not be able to
land an answer on a stale question.

### 7.6 Reload safety and secrets

On mount a block knows nothing. Until resolutions arrive it renders `open` but
**inert** -- visible, not clickable, no spinner. A block that flashes
clickable-then-stamped on every reload trains people to click fast, which is
exactly the reflex you do not want on a `danger` block.

A `secret` field goes up once, lands wherever secrets land, and is replaced by
`"••••••"` in the stamp record, the rendered receipt, and the tag. The transcript
is a permanent artifact; do not put an API key in it.

---

## 8. Security

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

---

## 9. Rendering and interaction rules

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

---

## 10. Authoring rules, for the agent

**Do**

- Put the block where the question naturally falls in the sentence. That is the
  entire point of inline.
- Write labels a human scans in one pass. `Product UI`, not `Option B`.
- Use the hint column for the *consequence*, not a restatement of the label.
  `live traffic, no undo` earns its pixels; `the production environment` does not.
- Reach for `@gallery` the moment the answer is aesthetic. Six images beat six
  adjectives, every time.
- Reach for `@scale` when the answer is a dial rather than a pick. "How formal"
  is never a multiple-choice question.
- Use `@example` whenever a field has a non-obvious shape. One example beats a
  paragraph explaining the shape.
- Set `expires` on anything time-sensitive; `@void` anything the conversation
  overtook.
- Give reversible choices an exit row (`Not sure yet`). A two-option block with
  no exit is a trap, and people click it just to make it go away.

**Do not**

- Do not use a block for something you could infer and state. A widget for a
  question you already know the answer to is friction dressed as courtesy.
- Do not exceed about six options, or eight gallery cards. More than that means
  the real answer is an `@input`.
- Do not put a `danger` block mid-paragraph. Give it its own line and its own beat.
- Do not emit a wall of unrelated blocks. Four is the ceiling, and only when they
  are one coherent act.
- Do not assume an answer will come.
- Do not reference a block's answer in text written *before* that answer exists.
- Do not write `<stamp>` tags. That channel belongs to the client.

### Interviews

ANVIL is at its best as an interview, not a form.

1. **Never more than one turn ahead.** Ask, read, react, then ask. An interview
   that emits all eight blocks at once is a form with extra steps.
2. **Cheap things in bulk, expensive things alone.** Four gallery picks in one
   turn is fine; each costs a glance. One `@upload` per turn; it costs real effort.
3. **React to what came back before asking the next thing.** That single
   sentence is the difference between an interview and a form.
4. **Contradictions are the deliverable.** If turn 1 says "warm and human" and
   turn 3 picks black-and-acid-yellow, *ask which one is true now*. No form can
   do that, and it is worth the other five turns combined.
5. **One `danger` per interview**, at the end, on the thing with a consequence.
   If everything is loud, nothing is.
6. **Uploads late, never first.** Nobody digs through their drive for a robot
   they have exchanged two sentences with.

---

## 11. Parser contract

The parser is **total**: it has no throw path. An LLM will eventually emit a
half-finished fence mid-stream, and a thrown parse error inside a page renderer
takes down far more than the block.

| Malformed input | Behaviour |
|---|---|
| unknown `@kind` | render as a warned `@note`, keep raw text |
| unknown leading sigil | treat as prose, append to the prompt |
| line before any `@` | implicit `@note` |
| duplicate `id` in one doc | second gets a suffix, warn |
| missing `id` | derive from content (see below) |
| unknown field type | fall back to `text`, warn |
| unclosed `~~~` | close at end of fence |
| unclosed fence (streaming) | render what parsed, mark `partial`, suppress interaction |
| `@gallery` row with no `img=` | placeholder for that row only |
| `> 12` options | render all of them plus a warning. **Never truncate.** |
| out-of-range `steps` / dial default | clamp, warn |
| non-string input | coerce, never throw |

Warnings are **surfaced in the rendered block**, not swallowed. An agent that
writes something the parser did not like should be able to see that.

### Derived ids

A block with no `id=` gets one derived from a hash of its kind and normalised
body. This must be **stable across re-renders and reloads**, so it can only
depend on content -- **never on array position**, in a list that streaming might
reorder. A positional id lands the stamp on the wrong block.

---

## 12. Failure modes, ranked by how much they hurt

| # | Failure | Guard |
|---|---|---|
| 1 | Parser throws on a partial stream | total parser (§11) + an error boundary per message |
| 2 | Stamp derived from client state | law II, resolutions from the server (§7.6) |
| 3 | No idempotency key | `(blockId, nonce)`, first wins, `409` for the rest (§7.3) |
| 4 | Stamp text handed to the model unframed | untrusted wrapper (§8.1) |
| 5 | A read-only viewer can stamp | server-side permission gate (§8.2) |
| 6 | Upload tag emitted before bytes land | stamp on submit, not on drop (§7.4) |
| 7 | Uploaded file not attached to the turn | attach real parts, not just a filename (§4.6) |
| 8 | Block autofocuses | §9.1, no exceptions |
| 9 | Height changes on stamp, or images pop in | §9.2, §9.4 |
| 10 | Unstable derived ids | hash content, never index (§11) |
| 11 | Secret echoed into the tag | mask server-side (§7.6) |
| 12 | Stale blocks left live | `expires` + `@void` (§4.11) |
| 13 | Answer also posted as a chat bubble | render as the stamp only (§6.3) |
| 14 | Example still clickable after target stamps | examples die with their target (§4.10) |
| 15 | Agent value in a style/src attribute | allowlist, do not escape (§8.3) |
| 16 | Tags hand-rolled per block | one serializer, one escaping policy (§6.2) |

---

## 13. Reference card

```
   ┌── ASK ───────────────────────────────────────────────────────────────┐
   │ @choice   text options            @upload  files, real attachments   │
   │ @gallery  image|swatch|type|card  @link    paste URL + fetched card  │
   │ @input    typed fields            @scale   sliders between poles     │
   │                                   @order   drag to rank              │
   │ common: id= select=one|many min= max= submit= icon= expires=         │
   │         optional danger phrase=                                      │
   ├── SHOW / CONTROL ────────────────────────────────────────────────────┤
   │ @note tone=info|warn|danger (markdown body)                          │
   │ @code lang= label=   @example for=<id>   @void id= reason=           │
   ├── LINES ─────────────────────────────────────────────────────────────┤
   │ ? prompt          : subtext          # comment (never rendered)      │
   │ - value | Label | hint | img= swatch= font= sample=   (! = danger)   │
   │ _ name[*] | type | Label | placeholder                               │
   │ % name | leftPole | rightPole | default                              │
   │ = field=value     > prose (markdown)     ~~~ … ~~~  literal          │
   ├── FIELD TYPES ───────────────────────────────────────────────────────┤
   │ text  longtext  number  bool  secret  path  url  date                │
   ├── STAMP ─────────────────────────────────────────────────────────────┤
   │ <stamp block="…" kind="…" value(s)= label(s)= [at= by=]>             │
   │   <field name=…>  <file name= mime= ref=>  <url href= title=>        │
   │   <dial name= value= norm= poles=>                                   │
   │   A sentence a human would have typed.                               │
   │ </stamp>                                                             │
   │ attributes are the TRUTH · the sentence is the COURTESY              │
   ├── STATES ────────────────────────────────────────────────────────────┤
   │ open → pending → stamped        open → expired        open → void    │
   │ stamped, expired and void are absorbing. Nothing leaves them.        │
   └──────────────────────────────────────────────────────────────────────┘
```

---

## 14. Conformance

An implementation is **ANVIL v1 conformant** if:

1. `parse` never throws, for any input, including every prefix of every fixture.
2. Unknown kinds, sigils, attributes and field types degrade with a warning
   rather than being dropped silently or throwing.
3. Derived ids depend only on content.
4. Blocks render inert while the fence is incomplete.
5. `swatch`, `font` and `img` are allowlisted; everything else is escaped.
6. If it implements stamping: the five laws hold, stamps are idempotent on
   `(blockId, nonce)`, and expiry is enforced server-side.
7. If it delivers stamps to a model: they are framed as untrusted data.

Reference implementation: [`packages/parser`](./packages/parser) and
[`packages/render-html`](./packages/render-html).

---

```
      ╭──────────────────────────────────────────────────────────────╮
      │   ┌───────┐                                                  │
      │   │ ◉   ◉ │    Rich going down. Structured text coming up.   │
      │   │   ‿   │    Ask it inline. Ask it once.                   │
      │   └──┬─┬──┘    The click is the signature.                   │
      │      ╰─╯                                                     │
      ╰──────────────────────────────────────────────────────────────╯
```
