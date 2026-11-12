/**
 * Every message this package writes, validated against the A2UI v1.0 schemas
 * (vendored, unmodified, see vendor/a2ui-v1.0/SOURCE.md). Run over the WHOLE
 * conformance corpus, so a new block kind or a new corner of an old one is
 * checked against the real protocol the day it lands, not when a renderer
 * rejects it in production.
 */
import { describe, expect, test } from 'bun:test'
import { cases } from '@anvil-md/conformance'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import toRenderer from '../vendor/a2ui-v1.0/agent_to_renderer.json' with { type: 'json' }
import catalog from '../vendor/a2ui-v1.0/catalog.json' with { type: 'json' }
import definition from '../vendor/a2ui-v1.0/catalog_definition.json' with { type: 'json' }
import common from '../vendor/a2ui-v1.0/common_types.json' with { type: 'json' }
import fromRenderer from '../vendor/a2ui-v1.0/renderer_to_agent.json' with { type: 'json' }
import { A2UIBridge } from './bridge'
import { FakeRenderer } from './fake-renderer'
import type { A2UIMessage } from './types'

// The envelope names its catalog `catalog.json`, relative to itself (the A2UI
// docs: "Map catalog.json to catalogs/basic/catalog.json"). So the basic
// catalog is registered under that address.
//
// Formats are VALIDATED, not skipped: a DateTimeInput's `min` is a `oneOf` of
// date, time and date-time, and with formats off all three match a date, so
// the oneOf fails for a value that is perfectly valid.
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addSchema(common)
ajv.addSchema(definition)
ajv.addSchema({ ...catalog, $id: 'https://a2ui.org/specification/v1_0/catalog.json' })
const agentMessage = ajv.compile(toRenderer)
const rendererMessage = ajv.compile(fromRenderer)

function problems(validate: typeof agentMessage, m: unknown): string {
  return validate(m) ? '' : JSON.stringify(validate.errors?.slice(0, 3))
}

describe('the A2UI schemas accept what the export writes', () => {
  test('the schemas themselves loaded, and refuse a broken message', () => {
    const bad = { version: '1.0', createSurface: { surfaceId: 's', catalogId: 'c', components: [{ id: 'root', component: 'Nope' }] } }
    expect(agentMessage(bad)).toBe(false)
  })

  for (const c of cases()) {
    test(`${c.id}: every surface, every press, every frozen surface`, () => {
      const bridge = new A2UIBridge(c.source)
      for (const m of bridge.messages) expect(problems(agentMessage, m), `${c.id} createSurface`).toBe('')

      // Press every button still on screen with whatever the defaults hold:
      // the action must be valid A2UI, and whatever the bridge answers -- a
      // stamp or a refusal -- the messages it sends back must be too. The
      // screen is read again after every press, because a stamp freezes the
      // block and takes its other buttons away.
      for (const surface of bridge.surfaces) {
        const r = new FakeRenderer(surface.message)
        const pressed = new Set<string>()
        for (;;) {
          const button = r.reachable().find(x => x.component === 'Button' && !pressed.has(x.id))
          if (!button) break
          pressed.add(button.id)
          const action = r.press(button.id)
          expect(problems(rendererMessage, action), `${c.id} ${button.id} action`).toBe('')
          const reply = bridge.receive(action)
          for (const m of reply.messages as A2UIMessage[]) expect(problems(agentMessage, m), `${c.id} frozen`).toBe('')
          r.apply(reply.messages)
        }
      }
    })
  }
})
