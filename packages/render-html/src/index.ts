/**
 * @anvil-md/render-html -- render an ANVIL fence to an HTML string.
 *
 * Display only unless the host passes `stamping`: then blocks draw open,
 * pending or stamped, and `attachAnvil` (`@anvil-md/render-html/hydrate`)
 * turns what the human does into an answer. See the README.
 */
export { renderAnvilFence } from './render'
export type { AnvilHost, CardFace, CardFaceContext } from './render'
export { answerOf } from './ask'
export type { AnvilStamping, BlockState } from './ask'
export { esc } from './blocks'
export { icon, resolveIcon } from './icons'
export type { IconName } from './icons'
