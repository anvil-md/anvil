---
title: "Sixty seconds"
nav: "Overview"
section: 0
summary: "The whole idea in sixty seconds: a fenced block going down, a structured tag coming up, and nothing in between."
---

ANVIL has exactly two halves, and nothing in between.

````
   ┌──────────────────────────┐                ┌──────────────────────────┐
   │  DOWN: a fenced block    │                │  UP: a structured tag    │
   │  the agent writes        │  ─── human ──► │  the client writes text. │
   │  markdown. The host      │      clicks    │  The agent reads text.   │
   │  renders it as REAL UI.  │                │                          │
   └──────────────────────────┘                └──────────────────────────┘
              ```anvil                                   <stamp …>
````

Down, mid-sentence, in an ordinary assistant message:

````markdown
Nice. Which of these feels like you?

```anvil
@gallery id=mood select=many max=2
? Pick the ones that feel right
- ed | Editorial | dense, warm | img=https://example.com/ed.jpg
- sw | Swiss     | airy, cold  | img=https://example.com/sw.jpg
- br | Brutal    | loud, black | img=https://example.com/br.jpg
```
````

That renders as a row of clickable cards. The human picks two and confirms. The
cards **stamp**: the picked ones lift, the rest fade, permanently.

Up, into the model's context, as a plain user turn:

```xml
<stamp block="mood" kind="gallery" values="ed,br" labels="Editorial,Brutal">
I picked Editorial and Brutal.
</stamp>
```

**That tag is the entire integration.** No tool calls, no widget runtime, no
event bus reaching into the agent loop. The model emits markdown and reads text;
everything between is the host's problem.

The attributes are the truth. The sentence inside is the courtesy -- it exists so
the transcript still reads like a conversation months later, and so a model that
ignores the tag entirely still gets the gist.
