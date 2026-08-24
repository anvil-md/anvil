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
   │ @card type= status= as= ask=      @board max= as=                    │
   │ the bar is COUNTED from the rows. there is no progress=              │
   │ @chart render=bar|column|line|spark|dot  unit= max= min= goal=       │
   │        values=3,5,4   one series · no axes · no sort · floor is 0    │
   │ @flow  dir=right|down   arrow makes a row an edge, else it is a node │
   ├── LAYOUT ────────────────────────────────────────────────────────────┤
   │ @grid cols=<max, 1-6> min= gap=tight|normal|loose frame              │
   │ @stack gap=            @end  (or the end of the fence)               │
   │ 2 deep max · no id · no coordinates · no breakpoints                 │
   ├── LINES ─────────────────────────────────────────────────────────────┤
   │ ? prompt          : subtext          # comment (never rendered)      │
   │ - value | Label | hint | img= swatch= font= sample=   (! = danger)   │
   │ - [ ] ref | Label | meta    [ ]todo [~]flight [x]done [!]blocked     │
   │ - Label | 42 | note           a @chart datum                         │
   │ - a -> b | label   - a -- b   a @flow edge  (-> --> => → )           │
   │ _ name[*] | type | Label | placeholder                               │
   │ % name | leftPole | rightPole | default                              │
   │ + chip | chip | chip          (a card's meta strip)                  │
   │ = field=value     > prose, or the detail of the task above           │
   │ ~~~ … ~~~  literal                                                   │
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
