/** Companion cells, one control each, on fixed rows. */

export interface GridControl {
	id: string
	row: number
	column: number
	stylePreset: 'key' | 'dial' | 'encoder'
}

export interface SurfaceGrid {
	controls: GridControl[]
	hasKeypad: boolean
	hasSliders: boolean
	hasDial: boolean
}

const VISIBLE = ['M4315', 'M003K', 'M032LE', 'M005S', 'M0064', '1xDial'] as const

/**
 * The rows the grid uses. They are fixed, so a module that is not connected
 * leaves its cells empty instead of moving the modules above or below it.
 */
export const STACK_ROW = { keypad: 0, sliders: 3, knobs: 4, rollers: 4, base: 5, dial: 5 } as const

type VisibleModule = (typeof VISIBLE)[number]

export function gridKey(controls: readonly GridControl[]): string {
	return controls
		.map((control) => `${control.id}@${control.row},${control.column}`)
		.sort()
		.join('|')
}

export function buildGrid(modules: readonly string[]): SurfaceGrid | null {
	const visible = VISIBLE.filter((name) => modules.includes(name))
	if (visible.length === 0) {
		return null
	}
	return {
		controls: stackedLayout(visible),
		hasKeypad: visible.includes('M4315'),
		hasSliders: visible.includes('M005S'),
		hasDial: visible.includes('M0064') || visible.includes('1xDial'),
	}
}

/**
 * The grid does not move while modules come and go. Keys fill rows 0-2, sliders row 3,
 * knobs and rollers row 4, and the dial and base row 5. Every module keeps its cells
 * whether or not the others are connected, so a module that is absent leaves a gap.
 * Each module lands on the same buttons every time.
 */
function stackedLayout(visible: readonly VisibleModule[]): GridControl[] {
	const controls: GridControl[] = []
	if (visible.includes('M4315')) {
		controls.push(
			...Array.from({ length: 15 }, (_, index) => ({
				id: `key/${index}`,
				row: STACK_ROW.keypad + Math.floor(index / 5),
				column: index % 5,
				stylePreset: 'key' as const,
			})),
		)
	}
	if (visible.includes('M005S')) {
		controls.push(
			...Array.from({ length: 5 }, (_, index) => ({
				id: `slider/${index}`,
				row: STACK_ROW.sliders,
				column: index,
				stylePreset: 'encoder' as const,
			})),
		)
	}
	if (visible.includes('M003K')) {
		controls.push(
			...Array.from({ length: 3 }, (_, index) => ({
				id: `knob/${index}`,
				row: STACK_ROW.knobs,
				column: index,
				stylePreset: 'encoder' as const,
			})),
		)
	}
	if (visible.includes('M032LE')) {
		controls.push(
			{ id: 'roller/0', row: STACK_ROW.rollers, column: 4, stylePreset: 'encoder' },
			{ id: 'roller/1', row: STACK_ROW.rollers, column: 3, stylePreset: 'encoder' },
		)
	}
	if (visible.includes('M0064')) {
		controls.push({ id: 'base', row: STACK_ROW.base, column: 1, stylePreset: 'encoder' })
	}
	if (visible.includes('1xDial')) {
		controls.push({ id: 'dial', row: STACK_ROW.dial, column: 0, stylePreset: 'dial' })
	}
	return controls
}
