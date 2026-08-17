---
title: "Parser contract"
nav: "Parser contract"
section: 11
summary: "The parser is total. What every malformed input degrades to, and why derived ids must come from content."
---

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
