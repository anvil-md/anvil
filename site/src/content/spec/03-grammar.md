---
title: "Grammar"
nav: "Grammar"
section: 3
summary: "Sigils, the line shapes, and why the in-block literal delimiter is ~~~ rather than a nested backtick fence."
---

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
