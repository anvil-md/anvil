---
title: "Blocks"
nav: "Blocks"
section: 4
summary: "Every block in turn: attributes, the rows it accepts, and what it renders as, open and stamped."
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
