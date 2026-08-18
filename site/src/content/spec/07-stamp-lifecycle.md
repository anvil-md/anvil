---
title: "Stamp lifecycle"
nav: "Lifecycle"
section: 7
summary: "The five laws, the state machine, idempotency on (blockId, nonce), expiry, reload safety and secrets."
---

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
