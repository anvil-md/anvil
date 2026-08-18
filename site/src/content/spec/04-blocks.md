---
title: "Blocks"
nav: "Blocks"
section: 4
summary: "Every block in turn: attributes, the rows it accepts, and what it renders as, open and stamped. Including @card, @board, @message and the two layout containers."
---

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
@message channel=email to="j@duplo.org" cc="ana@x.dev, kit@x.dev"
         from="bot@frst.dev" ask="Send it?"
? Re: the retry ladder
> Hey Jonas,
>
> The retry ladder is in. Three attempts, then dead-letter.
+ patch.diff | 4 KB
```

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
