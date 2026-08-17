---
title: "Reference card"
nav: "Reference card"
section: 13
summary: "The whole language on one screen."
---

```
   ┌── ASK ───────────────────────────────────────────────────────────────┐
   │ @choice   text options            @upload  files, real attachments   │
   │ @gallery  image|swatch|type|card  @link    paste URL + fetched card  │
   │ @input    typed fields            @scale   sliders between poles     │
   │                                   @order   drag to rank              │
   │ common: id= select=one|many min= max= submit= icon= expires=         │
   │         optional danger phrase=                                      │
   ├── SHOW / CONTROL ────────────────────────────────────────────────────┤
   │ @note tone=info|warn|danger (markdown body)                          │
   │ @code lang= label=   @example for=<id>   @void id= reason=           │
   ├── LINES ─────────────────────────────────────────────────────────────┤
   │ ? prompt          : subtext          # comment (never rendered)      │
   │ - value | Label | hint | img= swatch= font= sample=   (! = danger)   │
   │ _ name[*] | type | Label | placeholder                               │
   │ % name | leftPole | rightPole | default                              │
   │ = field=value     > prose (markdown)     ~~~ … ~~~  literal          │
   ├── FIELD TYPES ───────────────────────────────────────────────────────┤
   │ text  longtext  number  bool  secret  path  url  date                │
   ├── STAMP ─────────────────────────────────────────────────────────────┤
   │ <stamp block="…" kind="…" value(s)= label(s)= [at= by=]>             │
   │   <field name=…>  <file name= mime= ref=>  <url href= title=>        │
   │   <dial name= value= norm= poles=>                                   │
   │   A sentence a human would have typed.                               │
   │ </stamp>                                                             │
   │ attributes are the TRUTH · the sentence is the COURTESY              │
   ├── STATES ────────────────────────────────────────────────────────────┤
   │ open → pending → stamped        open → expired        open → void    │
   │ stamped, expired and void are absorbing. Nothing leaves them.        │
   └──────────────────────────────────────────────────────────────────────┘
```
