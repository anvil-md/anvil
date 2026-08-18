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

---

## 3. Grammar

Line-oriented, no lookahead. Leading whitespace is insignificant. Blocks are
flat; the only nesting is a layout container holding blocks, capped at two
deep (§4.14).

### 3.1 Sigils

| Sigil | Means | Appears in |
|---|---|---|
| `@` | block header: `@kind key=value key="quoted value"` | starts every block |
| `?` | the prompt, or a card's title, or a container's group label | all |
| `:` | subtext / help, rendered smaller under the prompt | all |
| `-` | an option row | `@choice` `@gallery` `@order` |
| `- [ ]` | a task row. The box is the state. | `@card` `@board` |
| `_` | a field row | `@input` |
| `%` | a scale row | `@scale` |
| `+` | the chip strip: `+ 5 pts \| high \| Sprint 24` | `@card` |
| `=` | a prefill row: `field=value` | `@example` |
| `>` | prose line (markdown), or the detail of the task row above it | `@note` `@card` |
| `#` | comment. Parsed, never rendered, never sent. | anywhere |
| `~~~` | literal fence, opens and closes a verbatim body | `@code` `@example` |

Two of those are the same sigil doing the same job in a second place, on
purpose. `-` is a row in a list either way, and the checkbox is what says the
row already has an answer. `>` is the sentence attached to the thing above it
either way. A second sigil for each would be two things to remember where the
language already had one.

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
task     = "-" , box , ref , [ "|" , label ] , [ "|" , meta ] , NL ;
box      = "[" , ( " " | "x" | "~" | "!" ) , "]" ;      (* "/" "-" alias "~"   *)
meta     = text | rollup ;
rollup   = digits , "/" , digits ;                      (* a child's own count *)
detail   = ">" , text , NL ;                            (* attaches to the task above *)
chips    = "+" , text , { "|" , text } , NL ;
layout   = ( "@grid" | "@stack" ) , { ws , attr } , NL , block* , [ "@end" , NL ] ;
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

The body is **markdown**, with one carve-out: a `#` at the start of a line is a
comment (§3.1) and never reaches the body, so an ATX heading cannot be written
inside a note. Use `**bold**` for a lead-in, or a second note. The sigil is
older than the block and stripping it is the one thing that keeps `#` usable as
a comment anywhere in the language.

Two more constraints come with markdown: reuse a configuration that escapes raw
HTML (this is agent-authored text), and add a recursion depth guard, because a
note containing an ` ```anvil ` fence would otherwise re-enter the renderer
forever.

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

### 4.12 `@card`

A work item: a story, an epic, a bug, a ticket. The single most common thing an
agent has to show a human while doing work, and the thing every chat surface
currently fakes with a bulleted list and a hand-typed percentage.

```anvil
@card id=ANV-114 type=story status=flight as=14:02
? Payment retry ladder
: Three attempts, 1m / 10m / 2h, then dead-letter.
+ 5 pts | high | Sprint 24 | epic ANV-100
- [x] ANV-115 | Retry scheduler      | Ana
- [x] ANV-116 | Backoff policy table | Ana
- [~] ANV-117 | Dead-letter queue    | Kit
> Kit · 2d in flight · 3 of 5 checks green. Needs the SQS policy
> from infra before this can merge. PR 482.
- [!] ANV-118 | Alerting hook        | blocked · ANV-117
- [ ] ANV-119 | Metrics
- [ ] ANV-120 | Runbook entry
- [ ] ANV-121 | Load test at 10x
```

```
   ╭─ ANV-114 · story ────────────────────────── ◐ in flight ──╮
   │  Payment retry ladder                                     │
   │  Three attempts, 1m / 10m / 2h, then dead-letter.         │
   │                                                           │
   │  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░  2/7 · 29%        │
   │                                                           │
   │  ✓  ANV-115  Retry scheduler                        Ana   │
   │  ✓  ANV-116  Backoff policy table                   Ana   │
   │  ◐  ANV-117  Dead-letter queue                      Kit   │
   │  ✕  ANV-118  Alerting hook             blocked · ANV-117  │
   │  ○  ANV-119  Metrics                                      │
   │  ○  ANV-120  Runbook entry                                │
   │  ○  ANV-121  Load test at 10x                             │
   │                                                           │
   │  5 pts · high · Sprint 24 · epic ANV-100                  │
   ╰──────────────────────────── as of 14:02 · snapshot ───────╯
```

Every number in that picture is produced by the rows above it, and a test in
this repo re-derives them from `SPEC.md` on every run. The first draft of this
section printed `3/7 · 43%` over five rows with two done, which is exactly the
failure §4.12.1 goes on to argue is worth a whole block to prevent.

| Attribute | Meaning |
|---|---|
| `type` | free text, shown as a chip. `epic`, `bug` and `spike` also pick the icon. |
| `status` | `todo` `flight` `done` `blocked`. Counted from the rows, and **the count wins** (§4.12.1). |
| `href` | a link to the real ticket. The card's only outbound affordance. |
| `as` | the timestamp the data was read. The renderer supplies no clock of its own. |
| `ask` | turns the card into a question (§4.12.4) |

`?` is the title. `:` is one line of subtext. `>` written **before the first
task row** is card-level prose; the same sigil after a row is that row's detail
(§4.12.3), and the ordering is the only thing that distinguishes them. `+` is
the chip strip, one chip per cell; a leading `!` marks one urgent.

`href` is allowlisted to `http(s)` like every other agent-authored URL (§8.3),
and it does **not** make the card interactive: a link is navigation, not an
answer.

**4.12.1 The bar is counted, never authored.**

There is no `progress=`. There is no `done=`. The bar, the `3/7` and the `43%`
are all computed from the rows on screen, and that is the whole reason `@card`
is an ANVIL block rather than an HTML embed: an agent that writes `3/7` above
nine subtasks is lying, and a format should not hand it the vocabulary.

A row may carry its own `n/m` in the meta cell -- an epic listing stories, each
with a count of its own. When any row does, every row contributes a pair and a
bare row counts as one of one, so the sum stays exact:

```anvil
@card id=ANV-100 type=epic as=14:02
? Billing that survives a bad night
- [~] ANV-114 | Payment retry ladder | 3/7
- [x] ANV-130 | Idempotency keys     | 6/6
- [ ] ANV-141 | Dunning emails       | 0/9
```

```
   ╭─ ANV-100 · epic ─────────────────────────── ◐ in flight ──╮
   │  Billing that survives a bad night                        │
   │                                                           │
   │  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░  9/22 · 41%        │
   │  ✓ done 1      ◐ flight 1      ○ todo 1                   │
   │                                                           │
   │  ◐  ANV-114  Payment retry ladder                         │
   │     ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░  3/7                         │
   │  ✓  ANV-130  Idempotency keys                             │
   │     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  6/6                         │
   │  ○  ANV-141  Dunning emails                               │
   │     ░░░░░░░░░░░░░░░░░░░░░░░░  0/9                         │
   ╰──────────────────────────── as of 14:02 · snapshot ───────╯
```

A child claiming more done than total is clamped where it is parsed, so one bad
row cannot poison every ancestor's bar. A count is read from the **end** of the
meta cell, so `Kit · 6/6` is both an assignee and a rollup; an `n/m` sitting
mid-cell is refused with a warning rather than guessed at, because `PR 3/7
checks` is not a progress count.

**And `status=` loses to the rows.** It exists because a card can be `blocked`
at any progress, which is a fact the rows cannot know, and because a card may
be written before it has any rows. But `status=done` above two open subtasks is
the same hand-typed claim this section bans, so the count wins and the
contradiction is a parse warning:

```
   status="done" contradicts 0/2; using "todo"
```

**4.12.2 A card is a snapshot, not a view.**

The footer says `snapshot`, always: no polling, no live subscription, no
refresh. When the ticket moves, emit a new card further down the conversation,
exactly as you would say the new thing out loud. `as=` is the agent's own
timestamp, and a renderer must **not** substitute its clock -- it cannot know
whether the data is fresh, and printing a time would claim that it does.

The rule is aimed at hosts, not at the grammar: a card carries no ticket handle
and nothing refetchable, so it *cannot* go stale on its own. Two blocks that
can, and until now did not say so:

> **A stamp cannot freeze bytes ANVIL does not own.** A `@gallery` renders
> `img=` from someone else's server and then stamps; that image can change, or
> 404, and the frozen record afterwards shows something other than what the
> human clicked. `@link` folds host-fetched metadata into a stamp the same way.
> A host that wants a record it can defend snapshots or proxies those bytes at
> stamp time, and stores the copy. Otherwise the stamp is honest about the
> click and silent about the thing clicked.

**4.12.3 Subtask detail is a disclosure, never a hover.**

A `>` line under a task row is that row's detail. It must be reachable by
pointer, by keyboard **and** by touch, and it must be in the document with an
`aria-describedby` from its row whether or not it is currently painted.

Hover-only detail is the same accessibility failure as drag-only ranking in
§4.9: it does not exist on a keyboard, and it does not exist on a phone.

**4.12.4 `ask=` is what makes a card a question.**

Without it, a card is a record and never stamps. With it, the card grows a
prompt and its `[ ]` rows become selectable -- and *only* its `[ ]` rows.
Offering a done or blocked subtask as "what next" is a lie about what the human
can choose.

```anvil
@card id=ANV-114 type=story ask="Which one do you want me to pick up next?"
- [!] ANV-118 | Alerting hook  | blocked · ANV-117
- [ ] ANV-119 | Metrics
- [ ] ANV-120 | Runbook entry
```

Everything in §6 and §7 then applies unchanged: it stamps once, it freezes, and
the rejected rows stay on screen because they are part of the record. A card
inherits `select`, `submit`, `min`, `max`, `optional` and `expires` from the
ASK table **only** while `ask=` is set; on a record they are meaningless and
warn.

**The pick marker must not be one of the four state glyphs.** A tick meaning
"you chose this" next to a circle meaning "this is not done" puts two different
questions in one row wearing the same vocabulary, and an agent re-reading its
own fence cannot tell them apart.

### 4.13 `@board`

The same task rows, grouped by the state they already carry.

```anvil
@board id=sprint-24 max=2 as=14:02
? Sprint 24
- [ ] ANV-119 | Metrics
- [ ] ANV-120 | Runbook entry
- [ ] ANV-121 | Load test at 10x
- [~] ANV-117 | Dead-letter queue
- [~] ANV-142 | Webhook replay
- [~] ANV-143 | Retry budget
- [x] ANV-115 | Retry scheduler
- [x] ANV-116 | Backoff policy table
```

```
   ╭─ Sprint 24 ───────────────────────────── 2/8 · 25% done ──╮
   │                                                           │
   │  ○ TODO 3          ◐ IN FLIGHT 3       ✓ DONE 2           │
   │  ▓▓▓▓░░░░░░        ▓▓▓▓░░░░░░          ▓▓▓░░░░░░░         │
   │                                                           │
   │  ANV-119           ANV-117             ANV-115            │
   │  Metrics           Dead-letter queue   Retry scheduler    │
   │                                                           │
   │  ANV-120           ANV-142             ANV-116            │
   │  Runbook entry     Webhook replay      Backoff table      │
   │                                                           │
   │  +1 more           +1 more                                │
   ╰──────────────────────────── as of 14:02 · snapshot ───────╯
```

Lanes are **derived**, so a board cannot claim a lane count that disagrees with
the cards in it, and an empty lane does not render at all. A board never
stamps: it is a record of many things, and there is no single question in it.

Two rules that are easy to get wrong:

- **`+N more` is mandatory.** `max` bounds a lane for readability; a board that
  truncates silently reads as a complete board, which is the same lie as an
  authored progress number.
- **A lane bar is a share of the board, not progress.** Announce it as
  `3 of 5 cards todo`. Announcing a todo lane as "3 of 5 done" is a
  straightforward lie to anyone who cannot see the colour.

### 4.14 `@grid` and `@stack`

Two containers. `@grid` flows its children into at most `cols` columns;
`@stack` is one column with a controlled gap. Both close at `@end`, or at the
end of the fence.

```anvil
@grid cols=3 min=16rem gap=normal
@card id=ANV-114 type=story status=flight
? Payment retry ladder
- [x] ANV-115 | Retry scheduler
- [~] ANV-117 | Dead-letter queue
@card id=ANV-130 type=story status=done
? Idempotency keys
- [x] ANV-131 | Key derivation
@end
```

| Attribute | Default | Meaning |
|---|---|---|
| `cols` | `2` | **maximum** columns, clamped 1-6. Not a count. |
| `min` | `14rem` | narrowest a column may get before the grid drops one |
| `gap` | `normal` | `tight` `normal` `loose`. A keyword, never a length. |
| `frame` | off | draw a border around the group |

Five rules, and the first is the one that matters:

**L1. No breakpoints. Ever.** The agent writing the fence cannot see the
screen, so it must not be allowed to guess at one. The surface rendering it is
as likely to be a 380px chat column on a 5K display as a full page, which means
a viewport media query is measuring the wrong box regardless. Collapse is
computed against the **container**:

```css
.anvil-auto {
  --anvil-cols: 2;      /* from cols=  */
  --anvil-min: 14rem;   /* from min=   */
  --anvil-lgap: 0.6rem; /* from gap=   */

  display: grid;
  gap: var(--anvil-lgap);
  grid-template-columns: repeat(auto-fit, minmax(
    min(100%, max(var(--anvil-min),
      calc((100% - (var(--anvil-cols) - 1) * var(--anvil-lgap)) / var(--anvil-cols))))
  , 1fr));
}
```

Every track is at least `--anvil-min`, so a column never gets unreadable. Every
track is also at least its exact share **once the gutters are subtracted** --
`(100% - (n-1)·gap) / n` -- so `n` tracks plus `n-1` gaps consume exactly 100%
and an `n+1`th cannot fit. That is what makes `cols` a maximum. The outer
`min(100%, …)` caps the track when the container is narrower than the minimum,
so a narrow panel collapses instead of overflowing. No media query, no
container query.

**The gap subtraction is not decoration.** A plain `100%/n` leaves
`n·(100%/n) + (n-1)·gap > 100%`, which caps the grid at `n-1` columns for any
non-zero gap. Anyone simplifying this expression should read that sentence
first.

Two more things the arithmetic depends on: `--anvil-lgap` must be the
container's actual `gap`, or the track width is computed against a gutter that
is not there; and grid items need `min-width: 0`, or one long unbroken ref
pushes a track past its share and quietly breaks the column count.

One case the formula does not cover: a grid whose own inline size is
**indefinite** (inside `width: fit-content`, or a float). CSS Grid resolves an
`auto-fit` track list against an indefinite size by repeating once, so it draws
one column whatever `cols` says. Give the container a definite width.

**L2. No coordinates.** No `span`, no `areas`, no `row-start`, no `order`. One
block per cell, in source order. A layout that needs a coordinate is a document,
not a sentence in a conversation, and this is the boundary that stops ANVIL
growing into a worse HTML.

**L3. Two containers deep, enforced by the parser.** Any container may hold any
other -- what is capped is the DEPTH, not the pairing, and two is the ceiling. A
third level is flattened with a warning rather than dropped, and it still
consumes its matching `@end` so everything below it stays balanced. `@grid`
holding a `@stack` is the case worth having; `@stack` inside `@stack` is a
no-op the parser permits rather than a shape anyone should write.

**L4. An unclosed container is not an error.** It closes at the end of the
fence, the same way an unclosed `~~~` does (§4.4), because a fence truncated
mid-grid must still render what arrived (§5).

**L5. Layout has no identity.** No `id`, no stamp, no `for=` target, no `@void`.
Layout is the one thing in ANVIL that cannot be answered, so it must not carry a
single pixel that suggests otherwise. An `id=` on a container is a warning and
is ignored.

### 4.15 `@message`

A message an agent is *proposing* to send: an email, a WhatsApp, an iMessage, an
SMS, a Slack post. Rendered with the chrome of the thing it will become, so the
human reads it the way the recipient will.

```anvil
@message channel=email to="j@duplo.org" cc="ana@x.dev" from="bot@frst.dev" ask="Send it?"
? Re: the retry ladder
> Hey Jonas,
>
> The retry ladder is in. Three attempts, then dead-letter.
+ patch.diff | 4 KB
```

**A header is one line.** It gets long, and wrapping it is the obvious thing to
reach for -- but §3.2's grammar ends the header at the newline, so a wrapped
attribute list is parsed as prompt text and the block silently loses every
attribute after the break. The parser warns when a sigil-less line opens with
`key=`, because the failure is otherwise invisible: the block renders, with a
line of machine text where its title should be.

```
   ╭─ EMAIL ───────────────────────────────── draft · not sent ──╮
   │  Re: the retry ladder                                       │
   │  ─────────────────────────────────────────────────────────  │
   │  FROM  bot@frst.dev                                         │
   │  TO    j@duplo.org                                          │
   │  CC    ana@x.dev  kit@x.dev                                 │
   │                                                             │
   │  Hey Jonas,                                                 │
   │                                                             │
   │  The retry ladder is in. Three attempts, then dead-letter.  │
   │                                                             │
   │  ⊕ patch.diff · 4 KB                                        │
   │                                                             │
   │  › Send it?                                        [ Send ] │
   ╰──────────────────────────────────── draft ──────────────────╯
```

| Attribute | Meaning |
|---|---|
| `channel` | `email` `whatsapp` `imessage` `sms` `signal` `telegram` `slack` `discord` `memo` |
| `to` `cc` `bcc` `from` | the envelope. Comma **or** semicolon separated. |
| `subject` | alias for the `?` line. `?` wins when both are given. |
| `state` | `draft` (default) `approved` `sent` `failed` `declined`. See §4.15.5. |
| `at` | when it reached that state. `by` names who. |
| `error` | with `failed`, what went wrong. Implies `state=failed`. |
| `sent` | sugar for `state=sent at=…`. **Must be asserted.** |
| `ask` | the send gate. Without it the block is a record and never stamps. |
| `danger` `phrase` | as §4, for a send that cannot be taken back |

`?` is the subject or headline. `>` is the body; a blank `>` is a paragraph
break. Each `+` line is one attachment: `name | size | mime`.

**4.15.1 Draft is the default, and that is a safety property.**

`sent` has to be **asserted**. Every message renders as `draft · not sent`
until an attribute says otherwise, and the state sits on the frame -- a tinted
pill and a dashed border -- rather than in the footer where nobody reads it.

The failure this prevents is specific and expensive: a human scrolls back three
screens, sees something that looks exactly like an email, and concludes it went
out. It never did. A block that renders a proposal identically to a record is
the same lie as a card that re-renders live state (§4.12.2), except the cost is
a message that never arrived.

**4.15.2 Nothing in a draft is a live affordance.**

Addresses render as **text, never as links**. A `mailto:` inside a draft is one
mis-click from a composer pre-filled with agent-authored text, and the whole
point of the block is that it is the place a human *reads* what is about to be
sent. The only thing on it that should do anything is the button that says yes.

For the same reason the button says what the click does. `Send`, not
`Confirm` -- the one moment a label matters is the one where the action leaves
the building.

**4.15.3 The send gate is an ordinary stamp.**

With `ask=`, everything in §6 and §7 applies unchanged: one click, one stamp,
frozen. That is the correct shape for an outbound message, because "did the
human approve this" is exactly the question a transcript should still be able to
answer six months later.

Pair it with `danger phrase="SEND"` when the send cannot be recalled.

**4.15.4 Unknown channels do not borrow chrome.**

A channel nobody has written chrome for renders as a plain memo plus a warning.
Drawing an unrecognised channel as a WhatsApp bubble tells the human this is
going somewhere it is not.

### 4.15.5 The lifecycle

```
   draft ──stamp──► approved ──host──► sent
     │                  │
     │                  └──host──► failed
     └──stamp──► declined
```

**The click is approval, not delivery.** This is the whole reason there are
five states rather than two. A stamp records that a human said yes at 14:04;
whether the SMTP handoff succeeded is a different fact, arriving three seconds
later, from a different actor, and it can be *no*. A block that flipped
straight to `sent` on the click would be telling exactly the lie §4.15.1 exists
to prevent, just further along the wire.

So the stamp moves the block to **`approved`**, and the host writes the outcome
afterwards:

| State | Means | Written by |
|---|---|---|
| `draft` | nobody has approved it | the agent (default) |
| `approved` | the human said yes; the wire has not answered | the **stamp** |
| `declined` | the human said no | the **stamp** |
| `sent` | delivery succeeded | the **host**, after the fact |
| `failed` | delivery was attempted and did not succeed | the **host**, with `error=` |

`sent`, `failed` and `declined` are **absorbing**, exactly like the stamp states
in §7.2. Nothing leaves them.

**4.15.5.1 This is the only post-stamp mutation in the language.**

§1 says a stamped block is frozen, and everywhere else that is absolute. The
`approved → sent | failed` edge is the one exception, and it is narrow enough to
defend: it is written **once**, by the **host**, it is **terminal**, and it
records an outcome *of* the stamp rather than editing the answer inside it. The
human's decision never changes. What changes is what the world did with it.

A host that cannot observe delivery must leave the block at `approved`. That is
an honest state, and it is a better one than a `sent` nobody witnessed.

**4.15.5.2 The gate becomes the receipt. It does not disappear.**

§9.2 requires a stamped block to occupy exactly the height it did while open,
and on a message the send gate is the tallest thing on the block -- so removing
it would jump every pixel below it up the page at the exact moment the human is
looking for confirmation.

It transforms instead. The question stays on screen and the button is replaced
by the answer:

```
   ╭─ EMAIL ───────────────────────────────── draft · not sent ──╮      ╭─ EMAIL ─────────────────────────────────────────── sent ──╮
   │  Re: the retry ladder                                       │      │  Re: the retry ladder                                     │
   │  ─────────────────────────────────────────────────────────  │      │  ───────────────────────────────────────────────────────  │
   │  TO    j@duplo.org                                          │  ►   │  TO    j@duplo.org                                        │
   │                                                             │      │                                                           │
   │  Hey Jonas, the retry ladder is in.                         │      │  Hey Jonas, the retry ladder is in.                       │
   │  ─────────────────────────────────────────────────────────  │      │  ───────────────────────────────────────────────────────  │
   │  › Send it?                                        [ Send ] │      │  ✓ Send it?              SENT · by Ana · at 14:07         │
   ╰──────────────────────────────────── draft ──────────────────╯      ╰────────────────────────────────── sent · at 14:07 ────────╯
```

Keeping the question is the §4.1 rule in a second place. A stamped choice keeps
its rejected rows because they show what the human was choosing between; a sent
message keeps its gate because **"what exactly did the human approve"** is the
thing a transcript exists to answer.

**4.15.5.3 The transition is one attribute.**

The state lives in `data-state` on the frame, and every visual difference --
accent, border, pill, receipt -- hangs off it. A host stamps by swapping that
one attribute on the live element, and the animation follows from CSS
transitions with no scripting and no re-render. A host that re-renders the
whole string instead gets a one-shot entry animation on the pill.

Two constraints on that animation, and they are not stylistic:

- **Opacity and transform only.** Anything that animates a box model reflows
  the block mid-transition, and §9.2 has just finished promising it will not
  move.
- **`prefers-reduced-motion` removes the motion, never the information.** The
  state must still be legible with every animation switched off, which it is,
  because the state is carried by colour, glyph and words -- not by the
  movement between them.

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

**One block extends this, and only one.** A `@message` carries an outcome
*after* it stamps, because the click is approval and the send happens later
(§4.15.5):

```
   ┌─────────┐   stamp    ┌──────────┐   host    ┌─────────┐
   │  open   │ ─────────► │ approved │ ────────► │  sent   │
   └─────────┘            └────┬─────┘           └─────────┘
                               │  host           ┌─────────┐
                               └───────────────► │ failed  │
                                                 └─────────┘
```

That edge is written **once**, by the **host**, and it is terminal. It records
what the world did with the stamp; it never edits the answer inside it. The
human's decision is still frozen at the instant they made it, which is all §1
ever asked for. A host that cannot observe delivery leaves the block at
`approved` -- an honest state, and a better one than a `sent` nobody witnessed.

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
- Emit a fresh `@card` when the work moves, instead of imagining the old one
  updated. The transcript is a sequence of states, and that is the useful part.
- Put a `@message` in front of anything that leaves the building, with `ask=`
  set. It costs one turn and it is the difference between a draft and an
  apology.
- Use `@grid` when several records deserve the same glance: three cards, or a
  card beside the note that explains it.

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
- **Do not put two questions side by side in a `@grid`.** A grid holds records.
  Two ASK blocks in one row is a form, and §10's whole argument is that an
  interview beats a form. One question per turn survives the layout.
- Do not type a progress number. There is nowhere to put one, and that is
  deliberate -- write the rows and let them count.
- Do not mark a `@message` `sent` until it has been. The default exists so that
  a lie takes an act of typing.

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
| 17 | A progress number that disagrees with the rows | count the rows; there is no `progress=` (§4.12.1) |
| 18 | A card that re-renders today's state | a card is a snapshot; emit a new one (§4.12.2) |
| 19 | Subtask detail on hover only | disclosure + `aria-describedby` (§4.12.3) |
| 20 | A lane bar announced as progress | it is a share of the board (§4.13) |
| 21 | A truncated lane that looks complete | `+N more`, always (§4.13) |
| 22 | Breakpoints in a layout the agent cannot see | container-driven `auto-fit`, `cols` is a max (§4.14 L1) |
| 23 | A draft rendered like a sent message | `sent` must be asserted; draft is the default (§4.15.1) |
| 24 | A `mailto:` or live link inside a draft | addresses are text; the only affordance is the gate (§4.15.2) |
| 25 | A stamp pointing at bytes someone else can change | snapshot or proxy `img=` / `@link` at stamp time (§4.12.2) |
| 26 | A row parsed and then never drawn | render it or warn; never both parse and drop (§11) |
| 27 | A stamp rendered as `sent` before delivery | the click is approval; the host writes the outcome (§4.15.5) |
| 28 | A send gate that vanishes when it stamps | it becomes the receipt, at the same height (§4.15.5.2, §9.2) |
| 29 | A state transition that animates a box model | opacity and transform only, or the block reflows (§4.15.5.3) |
| 30 | A wrapped `@` header losing half its attributes | headers are one line; the parser warns on a `key=` continuation (§3.2) |

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
   │ @card type= status= as= ask=      @board max= as=                    │
   │ the bar is COUNTED from the rows. there is no progress=              │
   ├── LAYOUT ────────────────────────────────────────────────────────────┤
   │ @grid cols=<max, 1-6> min= gap=tight|normal|loose frame              │
   │ @stack gap=            @end  (or the end of the fence)               │
   │ 2 deep max · no id · no coordinates · no breakpoints                 │
   ├── LINES ─────────────────────────────────────────────────────────────┤
   │ ? prompt          : subtext          # comment (never rendered)      │
   │ - value | Label | hint | img= swatch= font= sample=   (! = danger)   │
   │ - [ ] ref | Label | meta    [ ]todo [~]flight [x]done [!]blocked     │
   │ _ name[*] | type | Label | placeholder                               │
   │ % name | leftPole | rightPole | default                              │
   │ + chip | chip | chip          (a card's meta strip)                  │
   │ = field=value     > prose, or the detail of the task above           │
   │ ~~~ … ~~~  literal                                                   │
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
5. `swatch`, `font`, `img` and `min` are allowlisted; everything else is escaped.
6. If it implements stamping: the five laws hold, stamps are idempotent on
   `(blockId, nonce)`, and expiry is enforced server-side.
7. If it delivers stamps to a model: they are framed as untrusted data.
8. Every number a `@card` or `@board` draws is counted from its rows. No
   attribute can set, override or contradict one.
9. A `@card` renders as a snapshot and never refreshes itself, and subtask
   detail is reachable without a pointer.
10. Layout collapses against its container, has no id, and never renders an
    interactive affordance of any kind.

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
