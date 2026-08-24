---
title: "Failure modes, ranked by how much they hurt"
nav: "Failure modes"
section: 12
summary: "Twenty-two ways to get this wrong, ranked by how much each one hurts, with the guard for each."
---

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
| 31 | A chart whose bar is shorter than the number printed on it | a bound may move the range, never exclude a value (§4.16.2) |
| 32 | A bar chart floored above zero without saying so | announce it in the scale line **and** in the bars (§4.16.2) |
| 33 | A chart you can see but cannot read a value off | every mode prints its numbers; the shape is `aria-hidden` (§4.16.1) |
| 34 | A flow that drops the back edge, or hangs on it | cycles are lifted out of ranking and drawn as returns (§4.17.3) |
