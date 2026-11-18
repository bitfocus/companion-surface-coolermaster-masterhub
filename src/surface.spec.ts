import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { SurfaceContext } from '@companion-surface/base'

import { usbGrid } from './grid.js'
import type { UsbLink } from './session.js'
import { MasterHubUsbSurface, registerProps } from './surface.js'

const BLACK = { r: 0, g: 0, b: 0 }

void describe('MasterHub surface', () => {
	void it('clears key and dial images and turns knob, slider, and base LEDs off', async () => {
		const { surface, images, colors } = surfaceWithEveryModule()
		await surface.blank()
		assert.deepEqual(images, [...Array.from({ length: 15 }, (_, index) => `key/${index}`), 'dial'])
		assert.deepEqual(colors, [
			...[0, 1, 2, 3, 4].map((index) => ({ id: `slider/${index}`, color: BLACK })),
			...[0, 1, 2].map((index) => ({ id: `knob/${index}`, color: BLACK })),
			{ id: 'base', color: BLACK },
		])
	})

	void it('sends a base colour to the base LED and leaves the dial screen alone', async () => {
		const { surface, images, colors } = surfaceWithEveryModule()
		const signal = new AbortController().signal
		await surface.draw(signal, { controlId: 'dial', color: '#112233', pressed: false })
		await surface.draw(signal, { controlId: 'base', color: '#090807', pressed: false })
		assert.deepEqual(images, [])
		assert.deepEqual(colors, [{ id: 'base', color: { r: 9, g: 8, b: 7 } }])
	})

	void it('registers the dial as a screen and knobs, sliders, and the base as LEDs', () => {
		const grid = usbGrid(['M4315', 'M005S', 'M003K', 'M032LE', 'M0064', '1xDial'])
		assert.ok(grid)
		const presets = registerProps(grid).surfaceLayout?.stylePresets
		assert.deepEqual(presets?.dial, { bitmap: { w: 240, h: 240, format: 'rgb' } })
		assert.deepEqual(presets?.led, { colors: 'hex' })
		const controls = registerProps(grid).surfaceLayout?.controls
		assert.equal(controls?.dial?.stylePreset, 'dial')
		assert.equal(controls?.base?.stylePreset, 'led')
		assert.equal(controls?.['knob/0']?.stylePreset, 'led')
		assert.equal(controls?.['slider/0']?.stylePreset, 'led')
		assert.equal(controls?.['roller/0']?.stylePreset, 'encoder')
	})

	void it('blanks when the surface locks and leaves it alone when it unlocks', async () => {
		const { surface, images, colors } = surfaceWithEveryModule()
		surface.showLockedStatus(true, 4)
		assert.equal(images.length, 16)
		assert.equal(colors.length, 9)
		const afterLock = { images: images.length, colors: colors.length }
		surface.showLockedStatus(false, 0)
		assert.deepEqual({ images: images.length, colors: colors.length }, afterLock)
	})
})

function surfaceWithEveryModule(): {
	surface: MasterHubUsbSurface
	images: string[]
	colors: Array<{ id: string; color: { r: number; g: number; b: number } }>
} {
	const grid = usbGrid(['M4315', 'M005S', 'M003K', 'M032LE', 'M0064', '1xDial'])
	assert.ok(grid)
	const images: string[] = []
	const colors: Array<{ id: string; color: { r: number; g: number; b: number } }> = []
	const link = {
		setKeyImage(index: number): void {
			images.push(`key/${index}`)
		},
		setDialImage(): void {
			images.push('dial')
		},
		setColor(id: string, color: { r: number; g: number; b: number }): void {
			colors.push({ id, color })
		},
	}
	return {
		surface: new MasterHubUsbSurface('hub', grid, {} as SurfaceContext, link as unknown as UsbLink, () => undefined),
		images,
		colors,
	}
}
