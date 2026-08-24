/**
 * The example catalogue.
 *
 * Every entry is real ANVIL source, rendered at BUILD TIME by the same parser
 * and renderer the packages ship. Nothing on the examples page is a screenshot,
 * a mock or a hand-written snippet of HTML -- if a block regresses, this page
 * shows the regression rather than the intention.
 *
 * A test lints every source below. The examples page cannot drift into teaching
 * ANVIL that the linter rejects.
 */

export interface Example {
	/** Anchor and stable link target. */
	id: string
	title: string
	/** The section of SPEC.md this demonstrates. */
	spec: string
	/** One or two sentences on WHY, not what. Rendered as prose beside the block. */
	note: string
	source: string
	/** Render the two panes stacked rather than side by side. For wide blocks. */
	wide?: boolean
}

export interface ExampleGroup {
	id: string
	title: string
	blurb: string
	examples: Example[]
}

export const GROUPS: ExampleGroup[] = [
	{
		id: 'asking',
		title: 'Asking',
		blurb:
			'The original half of the language. Each of these stamps once and then freezes, and the rejected options stay on screen because they show what the human was choosing between.',
		examples: [
			{
				id: 'choice',
				title: '@choice',
				spec: '4.1',
				note: 'The hint column carries the *consequence*, not a restatement of the label. `live traffic, no undo` earns its pixels; "the production environment" would not. A `!` prefix marks one row destructive.',
				source: `@choice id=deploy-target
? Where should I ship this?
: Staging is wiped nightly. Nothing there is permanent.
- prod   | Production  | live traffic, no undo
- stage  | Staging     | safe, wiped nightly
- !scrap | Start over  | we bin the existing build
- hold   | Nowhere yet | keep it on the shelf`,
			},
			{
				id: 'choice-many',
				title: '@choice select=many',
				spec: '4.1',
				note: 'Multi-select is the same block with one attribute. It grows checkboxes and a submit, because a set is not answered until the human says it is finished.',
				source: `@choice id=stack select=many min=1 max=3 submit="That's the stack"
? What is already in the building?
: Up to three. Pick what you would not remove.
- pg     | Postgres    | the source of truth
- redis  | Redis       | queues and sessions
- s3     | Object store
- k8s    | Kubernetes  | somebody has to run it`,
			},
			{
				id: 'gallery-swatch',
				title: '@gallery render=swatch',
				spec: '4.2',
				note: 'Reach for a gallery the moment the answer is aesthetic. Six swatches beat six adjectives, every time, and nobody has ever agreed on what "warm" means.',
				source: `@gallery id=palette render=swatch select=one
? Which palette?
- ink  | Ink and paper | warm, printed | swatch=#111111,#f5f2ea,#c8452d
- deep | Deep water    | cold, gridded | swatch=#0b2540,#1d7a8c,#e8f1f2
- volt | Volt          | loud, black   | swatch=#0a0a0a,#e6ff00,#8a8a8a
- moss | Moss          | quiet, matte  | swatch=#1f2a1c,#7f9971,#e7e3d6`,
			},
			{
				id: 'input',
				title: '@input',
				spec: '4.3',
				note: 'Eight field types, each with its own control. `secret` is the one that matters: it is masked here **and** the value never reaches the transcript, because a stamp is text a model reads.',
				source: `@input id=company submit="That's us"
? Who are you?
: Anything marked with a star is required before the block will submit.
_ legal*  | text     | Legal name      | Acme Ltd
_ site    | url      | Current website | https://...
_ seats   | number   | How many seats  | 25
_ token   | secret   | API key
_ brief   | longtext | Anything else we should know
_ nda     | bool     | We need an NDA first`,
			},
			{
				id: 'scale',
				title: '@scale',
				spec: '4.8',
				note: 'For when the answer is a dial rather than a pick. "How formal" is never a multiple-choice question. The poles are what the human reads; the name is the machine key.',
				source: `@scale id=voice steps=7
? How should the copy read?
: Seven notches. The middle one is the default when you omit the number.
% formal | Formal   | Playful  | 3
% terse  | Terse    | Detailed | 5
% warm   | Clinical | Warm     | 6`,
			},
			{
				id: 'note',
				title: '@note',
				spec: '4.5',
				note: 'Three tones and no interaction. A full border and a tint, never a left accent stripe -- the stripe is the tell of every default markdown callout and reads as boilerplate.',
				source: `@note tone=warn
> Staging shares the production database.
> Migrations you run there are real, and there is no snapshot.

@note tone=danger
> The loudest tone in the language. Spend it carefully.

@note tone=info
> And the quiet one, for the things that are not questions at all.`,
			},
		],
	},
	{
		id: 'records',
		title: 'Records',
		blurb:
			'Blocks that show rather than ask. Every number they draw is counted from the rows above it: there is no progress attribute, and that absence is the reason these are blocks instead of markdown.',
		examples: [
			{
				id: 'card',
				title: '@card',
				spec: '4.12',
				note: 'Delete a subtask row and the bar moves. There is nowhere to type `3/7`, so a card cannot claim a number its own list disagrees with. Hover or tab to a row with a `>` line under it.',
				source: `@card id=ANV-114 type=story status=flight as=14:02 href=https://x.dev/ANV-114
? Payment retry ladder
: Three attempts, 1m / 10m / 2h, then dead-letter.
+ !high | 5 pts | Sprint 24 | epic ANV-100
- [x] ANV-115 | Retry scheduler      | Ana
- [x] ANV-116 | Backoff policy table | Ana
- [~] ANV-117 | Dead-letter queue    | Kit
> Kit - two days in flight, three of five checks green.
> Needs the SQS policy from infra before this can merge.
- [!] ANV-118 | Alerting hook        | blocked on ANV-117
- [ ] ANV-119 | Metrics
- [ ] ANV-120 | Runbook entry
- [ ] ANV-121 | Load test at 10x`,
			},
			{
				id: 'epic',
				title: '@card type=epic',
				spec: '4.12.1',
				note: 'An epic is the same block whose rows carry their own counts. The parent sums them exactly -- `3/7 + 6/6 + 0/9` -- rather than averaging three percentages into a number that means nothing.',
				source: `@card id=ANV-100 type=epic as=14:02
? Billing that survives a bad night
: Every child carries its own count, and the parent sums them.
- [~] ANV-114 | Payment retry ladder | 3/7
- [x] ANV-130 | Idempotency keys     | 6/6
- [ ] ANV-141 | Dunning emails       | 0/9`,
			},
			{
				id: 'board',
				title: '@board',
				spec: '4.13',
				note: 'The same task rows, grouped by the state they already carry. Lanes are derived, so a board cannot claim a count that disagrees with the cards in it, and `max` never truncates silently.',
				wide: true,
				source: `@board id=sprint-24 max=2 as=14:02
? Sprint 24
- [ ] ANV-119 | Metrics
- [ ] ANV-120 | Runbook entry
- [ ] ANV-121 | Load test at 10x
- [~] ANV-117 | Dead-letter queue
- [~] ANV-142 | Webhook replay
- [~] ANV-143 | Retry budget
- [x] ANV-115 | Retry scheduler
- [x] ANV-116 | Backoff policy table`,
			},
			{
				id: 'card-ask',
				title: '@card ask=',
				spec: '4.12.4',
				note: 'One attribute turns a record into a question. Only the open rows become pickable -- offering a done or blocked subtask as "what next" would be a lie about what the human can choose.',
				source: `@card id=ANV-114 type=story ask="Which one do you want me to pick up next?"
? Payment retry ladder
- [x] ANV-115 | Retry scheduler
- [!] ANV-118 | Alerting hook | blocked on ANV-117
- [ ] ANV-119 | Metrics
- [ ] ANV-120 | Runbook entry
- [ ] ANV-121 | Load test at 10x`,
			},
		],
	},
	{
		id: 'messages',
		title: 'Messages',
		blurb:
			'A message an agent is proposing to send, drawn with the chrome of the thing it will become. It reads as a draft until something asserts otherwise, and that default is the safety property.',
		examples: [
			{
				id: 'message-email',
				title: '@message channel=email',
				spec: '4.15',
				note: 'Addresses are text, never links. A `mailto:` inside a draft is one mis-click from a composer pre-filled with agent-authored text, and this block is the place a human *reads* what is about to go out.',
				source: `@message channel=email to="jonas@duplo.org" cc="ana@x.dev, kit@x.dev" from="bot@frst.dev" ask="Send it?"
? Re: the retry ladder
> Hey Jonas,
>
> The retry ladder is in. Three attempts, then dead-letter. The
> alerting hook is still blocked on the SQS policy from infra.
+ patch.diff | 4 KB`,
			},
			{
				id: 'message-chrome',
				title: 'Channels',
				spec: '4.15.4',
				note: 'Three chromes cover every channel worth drawing: an envelope, a bubble, a channel post. Anything unrecognised renders as a plain memo with a warning rather than borrowing somebody else\'s bubble.',
				source: `@message channel=whatsapp to="+66945556292" sent=14:07
> retry ladder is live. 2 of 7 subtasks done.

@message channel=slack to="#eng-billing" ask="Post it?"
? Deploy notice
> Shipping the retry ladder to prod in ten minutes.`,
			},
			{
				id: 'lifecycle',
				title: 'draft → approved → sent',
				spec: '4.15.5',
				note: 'The click is approval, not delivery. A stamp records that a human said yes at 14:04; the send happens afterwards and can fail. Note that the gate never disappears -- it becomes the receipt, at the same height, so nothing below it jumps.',
				wide: true,
				source: `@grid cols=2 min=19rem
@message channel=email to="j@duplo.org" ask="Send it?"
? Re: the retry ladder
> The ladder is in. Three attempts, then dead-letter.
@message channel=email to="j@duplo.org" ask="Send it?" state=approved at=14:04 by=Ana
? Re: the retry ladder
> The ladder is in. Three attempts, then dead-letter.
@message channel=email to="j@duplo.org" ask="Send it?" state=sent at=14:04:23 by=Ana
? Re: the retry ladder
> The ladder is in. Three attempts, then dead-letter.
@message channel=email to="j@duplo.org" ask="Send it?" at=14:04:26 by=Ana error="550 mailbox unavailable"
? Re: the retry ladder
> The ladder is in. Three attempts, then dead-letter.
@end`,
			},
		],
	},
	{
		id: 'pictures',
		title: 'Pictures',
		blurb:
			'Numbers as a shape, and a process as a diagram. Both are records: neither one ever stamps, and neither one refreshes itself. Every value a chart draws is also printed, because a shape you cannot read a number off is a picture of data rather than data.',
		examples: [
			{
				id: 'chart-bar',
				title: '@chart',
				spec: '4.16',
				note: 'The range starts at zero, always. A chart floored at its smallest value makes 98 look twice 96, which is the oldest trick in the book -- and the one thing an agent that cannot see the screen should never be trusted to decide.',
				source: `@chart id=signups render=bar unit=k as=14:02
? Signups by week
: Week 22 is the launch.
- W21 | 3.2
- W22 | 4.8 | launch
- W23 | 4.1
- W24 | 4.4`,
			},
			{
				id: 'chart-goal',
				title: 'A truncated axis, announced',
				spec: '4.16.2',
				note: 'Four uptimes between 99.2 and 99.99 are four identical full-height bars against a zero floor -- a chart that has told you nothing. `min=` lifts the floor, and the block then says **`scale from 99%, not zero`** in warning ink and notches every bar at the origin. Truncating is fine. Truncating silently is the oldest deception in the subject.',
				source: `@chart id=uptime render=column unit=% min=99 max=100 goal=99.9 as=14:02
? Uptime by service
- api      | 99.98
- workers  | 99.94
- webhooks | 99.21 | two incidents
- search   | 99.99`,
			},
			{
				id: 'chart-spark',
				title: 'render=spark',
				spec: '4.16.4',
				note: 'The one-line case. `values=` is shorthand for a series with no labels, which is what a trend actually is -- and the full series still goes into the page as text, so the block is not empty to a screen reader.',
				source: `@chart id=p95 render=spark values=12,14,11,19,24,22,31 unit=ms goal=20
? p95 latency, 7d
: The dashed rule is the SLO.`,
			},
			{
				id: 'chart-negative',
				title: 'Negative values',
				spec: '4.16.2',
				note: 'A negative bar grows the other way from the same baseline, so its **length** is still its magnitude and only its direction changed. Zero moves to wherever zero actually is.',
				source: `@chart id=delta render=bar unit=% as=14:02
? Week on week
- signups   | 12.4
- activated | 4.1
- churn     | -2.8 | good
- revenue   | -0.4`,
			},
			{
				id: 'flow',
				title: '@flow',
				spec: '4.17',
				note: 'One sigil, and the arrow decides. A row with an arrow is an edge, a row without one declares a node -- the same trick a `@card` plays with the checkbox. The four states are the four `@card` states, wearing the same accents.',
				wide: true,
				source: `@flow id=retry dir=right as=14:02
? Payment retry ladder
- [x] charge | Charge      | 1st attempt
- [x] retry1 | Retry 1     | 1m backoff
- [~] retry2 | Retry 2     | 10m backoff
- [!] dlq    | Dead letter | shape=round
- charge -> retry1 | fails
- retry1 -> retry2 | still failing
- retry2 -> dlq    | after 2h
- retry2 -> charge | recovered`,
			},
			{
				id: 'flow-decision',
				title: 'Shapes, and a cycle',
				spec: '4.17.3',
				note: 'A cycle is legitimate -- a retry ladder is a cycle, and so is every state machine worth drawing. The back edge is lifted out of the ranking and drawn dashed in its own lane, because dropping it would hide the loop that is the whole point of the diagram.',
				wide: true,
				source: `@flow id=review dir=down as=14:02
? Pull request review
- [x] open   | PR opened  | shape=round
- [~] review | Approved?  | shape=diamond
- [ ] merge  | Merge      | squash
- [ ] fix    | Push fixes
- open -> review
- review -> merge | yes
- review -> fix   | changes requested
- fix -> review   | re-request`,
			},
			{
				id: 'chart-beside-a-card',
				title: 'A picture next to the thing it is about',
				spec: '4.14',
				note: 'This is what the two blocks are for. The card is the work, the chart is the reason -- side by side in the sentence where the question was asked, rather than in a dashboard somebody has to go and find.',
				wide: true,
				source: `@grid cols=2 min=18rem
@card id=ANV-140 type=bug status=flight as=14:02
? Webhook retries are hammering the origin
+ !P1 | Sprint 24
- [x] ANV-141 | Reproduce in staging | Ana
- [~] ANV-142 | Add a retry budget   | Kit
- [ ] ANV-143 | Backfill the alert
@chart id=webhook-rate render=spark values=210,240,260,890,1240,1180,1330 unit=/min goal=300
? Origin requests, 7d
: The step is when the retry loop went out.
@end`,
			},
		],
	},
	{
		id: 'layout',
		title: 'Layout',
		blurb:
			'Two containers, and no breakpoints anywhere. The agent writing the fence cannot see the screen, so cols is a maximum rather than a count and the collapse is computed against the container. Drag this window narrower.',
		examples: [
			{
				id: 'grid',
				title: '@grid',
				spec: '4.14',
				note: 'Three cards at most, one card at least, and every step in between decided by how much room this column actually has. No media query is involved, which is why it still works inside a 380px chat panel on a 5K display.',
				wide: true,
				source: `@grid cols=3 min=15rem gap=normal
@card id=ANV-114 type=story status=flight
? Payment retry ladder
- [x] ANV-115 | Retry scheduler
- [~] ANV-117 | Dead-letter queue
- [ ] ANV-119 | Metrics
@card id=ANV-130 type=story status=done
? Idempotency keys
- [x] ANV-131 | Key derivation
- [x] ANV-132 | Replay guard
@card id=ANV-141 type=story
? Dunning emails
- [ ] ANV-142 | Template set
- [ ] ANV-143 | Cadence rules
@end`,
			},
			{
				id: 'stack',
				title: '@stack inside @grid',
				spec: '4.14',
				note: 'Two containers deep, and that is the ceiling. A layout that needs a third level is a document rather than a sentence in a conversation, and that boundary is what stops ANVIL growing into a worse HTML.',
				wide: true,
				source: `@grid cols=2 min=17rem
@stack gap=tight frame
? This sprint
@card id=ANV-114 type=story status=flight
? Payment retry ladder
- [x] ANV-115 | Retry scheduler
- [~] ANV-117 | Dead-letter queue
@card id=ANV-130 type=story status=done
? Idempotency keys
- [x] ANV-131 | Key derivation
@end
@note tone=warn
> Staging shares the production database. Migrations you run there
> are real, and there is no snapshot.
@end`,
			},
		],
	},
	{
		id: 'in-practice',
		title: 'In practice',
		blurb:
			'What the language actually looks like in a conversation, and what it does when the agent gets it wrong.',
		examples: [
			{
				id: 'turn',
				title: 'One turn of an interview',
				spec: '10',
				note: 'ANVIL is at its best as an interview, not a form: a record to react to, one question, and the warning that makes the question worth asking. Never more than one turn ahead -- an agent that emits all eight blocks at once has written a form with extra steps.',
				wide: true,
				source: `@card id=ANV-114 type=story status=flight as=14:02
? Payment retry ladder
- [x] ANV-115 | Retry scheduler
- [~] ANV-117 | Dead-letter queue | Kit
- [ ] ANV-119 | Metrics

@note tone=warn
> ANV-118 is blocked on an infra ticket nobody has picked up.

@choice id=next-move
? So what do you want me to do with the alerting hook?
: It is the last thing between this and done.
- chase | Chase infra      | I will open a ticket and link it here
- stub  | Stub it for now  | ships today, real alerting next sprint
- wait  | Leave it blocked | the sprint slips`,
			},
			{
				id: 'degrading',
				title: 'Every line here is wrong',
				spec: '11',
				note: 'The parser is **total**: it has no throw path, because a model emits a fence token by token and a thrown parse error inside a page renderer takes down far more than one block. Each mistake below degrades to a warning and the block still renders.',
				wide: true,
				source: `@choice id=broken steps=99
? Which environment?
-       | Production | the value before the first pipe is missing
- stage | Staging
_       | text | a field row with no name either
% | Left | Right

@chioce id=nope
? a block kind that does not exist at all

@card id=lying progress=99
- [ ] ANV-1 | Ship it | due 24/12
- [z] ANV-2 | An unknown checkbox state
- [~] ANV-3 | More done than there is | 9/4

@input id=typed
_ email | emial | a field type nobody has heard of`,
			},
		],
	},
]

export const EXAMPLES: Example[] = GROUPS.flatMap(g => g.examples)
