# @anvil-md/conformance

The ANVIL conformance corpus: one JSON file of cases that any implementation, in
any language, can run against itself.

[`corpus.json`](./corpus.json) is the artefact. It has no TypeScript in it and
no dependency on this repository -- read it, run your parser, compare. The TS
runner in [`src/run.test.ts`](./src/run.test.ts) is only how the reference
implementation holds itself to it.

```sh
bun test packages/conformance
```

## The shape of a case

```json
{
  "id": "card-progress-is-counted",
  "spec": "4.12.1",
  "title": "the bar is counted from the rows and no attribute can move it",
  "source": "@card id=c progress=99\n- [x] a\n- [ ] b\n- [ ] c",
  "expect": {
    "blocks": [{ "kind": "card", "progress": { "done": 1, "total": 3, "pct": 33 } }],
    "htmlContains": ["1/3 · 33%"],
    "htmlExcludes": ["9/9"]
  }
}
```

Every case names the section of [SPEC.md](../../SPEC.md) it pins, so a failure
tells you which paragraph you broke rather than which assertion.

## What the runner adds to every case, declared or not

1. the expectations above;
2. no throw on the source;
3. **no throw on every prefix of the source**;
4. no throw in the renderer, on every prefix.

(3) and (4) are why a corpus beats a pile of hand-written tests. A fence arrives
from a model token by token, so every prefix of it is a real input a renderer
will see -- and a case added for a feature becomes a totality case for free.

## Which keys your implementation has to satisfy

`blocks`, `tree`, `topLevelKinds`, `maxDepth`, `warnings` and `warningsContain`
are about the **document model** and apply to any implementation.

`htmlContains`, `htmlExcludes` and `htmlCount` name substrings the spec requires
to be *observable* -- `data-sent="no"`, `+2 more`, an escaped script tag -- never
a class name that merely happens to exist in `@anvil-md/render-html`. A renderer
with different markup should still pass everything in the first group.

## Two guards on the corpus itself

- **No case may assert nothing.** A case whose `expect` has no key the runner
  reads is a green test that proves nothing and is invisible in a passing suite.
- **The runner is tested against itself.** A deliberately wrong expectation must
  fail, so a comparison that quietly stops running is caught rather than turning
  the whole corpus green.

## Adding a case

Append to `corpus.json`. Give it an id, the section it pins, a title that reads
as a sentence about the language, and at least one real assertion. If you are
adding it because something broke, write the case first and watch it fail.

MIT.
