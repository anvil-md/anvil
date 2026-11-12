/**
 * The slice of A2UI v1.0 this package writes and reads. The full schemas are
 * vendored under `vendor/a2ui-v1.0/`, and every message this package writes
 * is validated against them in the tests, so these types can stay small.
 */

/** The basic catalog's id, as the catalog itself declares it. */
export const BASIC_CATALOG = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'

/** The one event name this package's controls dispatch. */
export const STAMP_EVENT = 'anvil.stamp'

export interface DataBinding {
  '@path': string
}

export interface FunctionCall {
  '@call': string
  args?: Record<string, unknown>
}

export interface CheckRule {
  condition: DataBinding | FunctionCall
  message?: string
}

export interface A11yAttributes {
  label?: string
  description?: string
  live?: 'off' | 'polite' | 'assertive'
  hidden?: boolean
}

export interface Component {
  id: string
  component: string
  '@accessibility'?: A11yAttributes
  '@checks'?: CheckRule[]
  [property: string]: unknown
}

export type A2UIMessage =
  | {
      version: '1.0'
      createSurface: {
        surfaceId: string
        catalogId: string
        components: Component[]
        dataModel: Record<string, unknown>
      }
    }
  | { version: '1.0'; updateComponents: { surfaceId: string; components: Component[] } }
  | { version: '1.0'; deleteSurface: { surfaceId: string } }

/** What a renderer sends when a control's `action.event` fires. */
export interface A2UIAction {
  version: '1.0'
  action: {
    name: string
    surfaceId: string
    sourceComponentId: string
    timestamp: string
    context: Record<string, unknown>
    userMessage?: string
  }
}
