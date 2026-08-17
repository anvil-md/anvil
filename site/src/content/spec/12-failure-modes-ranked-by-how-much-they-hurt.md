---
title: "Failure modes, ranked by how much they hurt"
nav: "Failure modes"
section: 12
summary: "Sixteen ways to get this wrong, ranked by how much each one hurts, with the guard for each."
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
