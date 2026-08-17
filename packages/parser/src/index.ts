/**
 * @anvil-md/parser -- the ANVIL document model and its parser.
 *
 * Zero dependencies, no DOM, no framework. Runs anywhere JavaScript runs.
 */
export { parseAnvil } from './parse'
export {
  ANVIL_KINDS,
  FIELD_TYPES,
  attrNumber,
  attrString,
  galleryRender,
  isMulti,
} from './types'
export type {
  AnvilBlock,
  AnvilDial,
  AnvilDoc,
  AnvilField,
  AnvilKind,
  AnvilOption,
  FieldType,
  GalleryRender,
  NoteTone,
} from './types'
