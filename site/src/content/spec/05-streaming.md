---
title: "Streaming"
nav: "Streaming"
section: 5
summary: "Every prefix of a fence is a real input. Blocks stay inert until the fence closes."
---

An LLM emits a fence token by token, so **every prefix of a fence is a real
input** the renderer will see.

While the message is still arriving, every block renders **inert**. A block that
becomes clickable before its last option has streamed in is how someone answers a
question they have not finished reading.

Hosts detect this however their pipeline allows -- typically by checking whether
the closing fence delimiter has arrived. `parseAnvil(src, { partial: true })`
marks the document so the renderer can show it as provisional.
