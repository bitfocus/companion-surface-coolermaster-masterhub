import type {
	CardGenerator,
	SurfaceContext,
	SurfaceDrawProps,
	SurfaceInputVariable,
	SurfaceInstance,
	SurfacePincodeMap,
	SurfaceRegisterProps,
} from '@companion-surface/base'
import { count } from './debug.js'
import { mapDaemonEvent, SliderMemory, type DaemonEvent } from './input.js'
import { blackJpeg, LatestJpegEncoder } from './jpeg.js'

import type { GridControl, SurfaceGrid } from './layout.js'

import { parseHexColor } from './color.js'
import { jpegMatching } from './jpeg-size.js'
import type { UsbLink } from './session.js'

const KEY_SIZE = 72
const DIAL_SIZE = 240

export class MasterHubUsbSurface implements SurfaceInstance {
	readonly productName = 'MasterHub'
	readonly surfaceId: string
	private readonly grid: SurfaceGrid
	private readonly context: SurfaceContext
	private readonly link: UsbLink
	private readonly onClose: () => void
	private readonly sliders = new SliderMemory()
	private readonly controlIds: ReadonlySet<string>
	private readonly encoder = new LatestJpegEncoder()
	/** Companion reports each entered digit with `locked` still true. The digit count is drawn on the pincode control. */
	private locked = false

	constructor(surfaceId: string, grid: SurfaceGrid, context: SurfaceContext, link: UsbLink, onClose: () => void) {
		this.surfaceId = surfaceId
		this.grid = grid
		this.context = context
		this.link = link
		this.onClose = onClose
		this.controlIds = new Set(grid.controls.map((control) => control.id))
	}

	async init(): Promise<void> {}

	async ready(): Promise<void> {}

	async close(): Promise<void> {
		await this.link.close()
		this.onClose()
	}

	async setBrightness(percent: number): Promise<void> {
		this.link.setBrightness(percent)
	}

	async blank(): Promise<void> {
		for (const control of this.grid.controls) {
			const size = bitmapSize(control)
			if (size) {
				this.sendJpeg(control, blackJpeg(size, size))
			}
			if (control.id === 'base' || control.id.startsWith('knob/') || control.id.startsWith('slider/')) {
				this.link.setColor(control.id, { r: 0, g: 0, b: 0 })
			}
		}
	}

	async draw(signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		if (signal.aborted) {
			return
		}
		count('draw calls')
		const control = this.grid.controls.find((item) => item.id === drawProps.controlId)
		if (!control) {
			return
		}
		const size = bitmapSize(control)
		if (size && drawProps.image && drawProps.image.length >= size * size * 3) {
			const encoded = this.encoder.encode(control.id, {
				rgb: drawProps.image,
				width: size,
				height: size,
			})
			if (!encoded) {
				count('draw superseded')
				return
			}
			if (signal.aborted) {
				count('draw aborted before send')
				return
			}
			if (jpegMatching(encoded, size)) {
				this.sendJpeg(control, encoded)
			}
		}
		if (drawProps.color && stylePreset(control) === 'led') {
			const color = parseHexColor(drawProps.color)
			if (color) {
				this.link.setColor(control.id, color)
			}
		}
	}

	async showStatus(signal: AbortSignal, cardGenerator: CardGenerator, _statusMessage: string): Promise<void> {
		if (signal.aborted) {
			return
		}
		const control = this.grid.controls.find((item) => bitmapSize(item) !== null)
		const size = control ? bitmapSize(control) : null
		if (!control || !size) {
			return
		}
		const image = await cardGenerator.generateBasicCard(size, size, 'rgb')
		if (signal.aborted) {
			return
		}
		await this.draw(signal, { controlId: control.id, image, pressed: false })
	}

	showLockedStatus(locked: boolean, _characterCount: number): void {
		if (locked === this.locked) {
			return
		}
		this.locked = locked
		if (locked) {
			void this.blank()
		}
	}

	disconnect(error: Error): void {
		this.context.disconnect(error)
	}

	handle(event: DaemonEvent): void {
		const mapped = mapDaemonEvent(event, this.sliders, this.controlIds)
		if (!mapped) {
			return
		}
		if (mapped.pressed === true) {
			this.context.keyDownById(mapped.controlId)
		} else if (mapped.pressed === false) {
			this.context.keyUpById(mapped.controlId)
		}
		if (mapped.delta) {
			this.context.rotateById(mapped.controlId, mapped.delta)
		}
		if (mapped.slider !== undefined && mapped.controlId.startsWith('slider/')) {
			this.context.sendVariableValue(`slider_${Number(mapped.controlId.slice('slider/'.length)) + 1}`, mapped.slider)
		}
	}

	private sendJpeg(control: GridControl, jpeg: Buffer): void {
		if (control.id === 'dial') {
			this.link.setDialImage(jpeg)
			return
		}
		if (control.id.startsWith('key/')) {
			this.link.setKeyImage(Number(control.id.slice('key/'.length)), jpeg)
		}
	}
}

export function registerProps(grid: SurfaceGrid): SurfaceRegisterProps {
	const transferVariables: SurfaceInputVariable[] = grid.hasSliders
		? [0, 1, 2, 3, 4].map((index) => ({
				id: `slider_${index + 1}`,
				type: 'input' as const,
				name: `Slider ${index + 1}`,
				description: 'Slider position from 0 to 100',
			}))
		: []
	return {
		brightness: true,
		surfaceLayout: {
			stylePresets: {
				default: {},
				key: { bitmap: { w: KEY_SIZE, h: KEY_SIZE, format: 'rgb' } },
				dial: { bitmap: { w: DIAL_SIZE, h: DIAL_SIZE, format: 'rgb' } },
				encoder: {},
				led: { colors: 'hex' },
			},
			controls: Object.fromEntries(
				grid.controls.map((control) => [
					control.id,
					{ row: control.row, column: control.column, stylePreset: stylePreset(control) },
				]),
			),
		},
		transferVariables,
		pincodeMap: pincodeMap(grid),
		location: null,
		configFields: null,
	}
}

function stylePreset(control: GridControl): string {
	if (control.id === 'dial') {
		return 'dial'
	}
	if (control.id === 'base' || control.id.startsWith('knob/') || control.id.startsWith('slider/')) {
		return 'led'
	}
	return control.stylePreset
}

function pincodeMap(grid: SurfaceGrid): SurfacePincodeMap | null {
	if (!grid.hasKeypad) {
		return null
	}
	return {
		type: 'single-page',
		// Companion draws one mark per stored digit on the first key, and clears them when the entry resets.
		pincode: 'key/0',
		0: 'key/10',
		1: 'key/1',
		2: 'key/2',
		3: 'key/3',
		4: 'key/6',
		5: 'key/7',
		6: 'key/8',
		7: 'key/11',
		8: 'key/12',
		9: 'key/13',
	}
}

function bitmapSize(control: GridControl): number | null {
	if (control.stylePreset === 'key') {
		return KEY_SIZE
	}
	if (control.stylePreset === 'dial') {
		return DIAL_SIZE
	}
	return null
}
