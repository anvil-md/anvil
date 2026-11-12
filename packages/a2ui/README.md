# @anvil-md/a2ui

Draw [ANVIL](https://github.com/anvil-md/anvil) blocks in any
[A2UI v1.0](https://a2ui.org) renderer, and turn what the human did there back
into ANVIL stamps.

The agent still writes ANVIL and still reads a `<stamp>`. A2UI is only the
screen. So everything ANVIL promises survives the trip, including the parts
A2UI does not have:

- **A block is answered once.** A2UI surfaces stay live after an action. The
  bridge refuses the second action on a block and replaces every control with
  the record, so there is nothing left to press (SPEC §7.1, law III).
- **The answer is judged, not trusted.** Every action is checked against its
  block: a value nobody was offered, two picks on `select=one`, a field that
  fails its own `pattern=`, a notch off the track. The renderer's `@checks`
  are a courtesy; the bridge runs `checkField` regardless.
- **Live rows are recorded.** A `query=` block exports the rows the host
  function returned, and its stamp carries them (SPEC §4.1.2).

## Use

```ts
import { A2UIBridge } from '@anvil-md/a2ui'

const bridge = new A2UIBridge(fenceBody, {
  surfacePrefix: `${messageId}_`,          // surface ids are unique per renderer lifetime
  offered: { slot: { fn: 'calendar.free', rows } }, // optional: live rows you resolved
})

send(bridge.messages)                     // one createSurface per block
bridge.warnings                           // what the basic catalog could not draw

// when the renderer sends an action:
const reply = bridge.receive(action, { by: session.user })  // WHO comes from you, never the payload
if (reply.ok) {
  appendUserTurn(reply.stamp)             // the <stamp> the agent reads
  send(reply.messages)                    // the frozen surface
} else {
  reply.refused                           // why; the block is still answerable
}
```

`toA2UI(fenceBody)` is the export without the round trip.

## What maps

| ANVIL | A2UI basic catalog |
|---|---|
| `@choice` / `@gallery` `select=one` | a `Button` per row; the click stamps |
| `@choice` / `@gallery` `select=many` | `ChoicePicker` + submit `Button` |
| `@input` | `TextField` / `CheckBox` / `DateTimeInput`, checks as `@checks` |
| `@scale` | a `Slider` per dial + submit `Button` |
| `@note` | `Text` |
| `@grid` / `@stack` | `Column` |
| `alt=` `desc=` `live=` `decorative` | `@accessibility` |
| anything else | `Text`, with a warning |

A `pattern=` goes out as an A2UI `regex` check only when A2UI's static safety
rules cannot reject it (an A2UI renderer refuses the whole surface over one
rejected pattern). The rest are enforced by the bridge alone.

## Tests

Every message the export and the bridge write, over the whole conformance
corpus, is validated against the A2UI v1.0 JSON schemas, vendored unmodified
under [`vendor/a2ui-v1.0`](./vendor/a2ui-v1.0/SOURCE.md) (Apache-2.0).
