import { buildGrid, type SurfaceGrid } from './layout.js'

/**
 * Keys in rows 0-2, sliders in row 3, knobs and rollers in row 4, and the dial and
 * base in row 5. Modules arrive by product id, which is not that order.
 */
export function usbGrid(modules: readonly string[]): SurfaceGrid | null {
	return buildGrid(modules)
}
