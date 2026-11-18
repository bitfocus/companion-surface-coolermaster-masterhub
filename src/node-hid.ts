import { createRequire } from 'node:module'

import type { Device } from 'node-hid'

import type { HidIdentity } from './discover.js'
import { matchingDevices } from './discover.js'
import type { HidPort } from './session.js'

// `node-hid` is a native module, so it cannot live in the bundled plugin file. Companion unpacks
// the plugin into `main.js` plus the module's own `node_modules`, so loading it lazily through a
// `require` rooted in that directory finds it at runtime and fails only if it is genuinely absent.
const requireHid = createRequire(import.meta.url)

function loadHid(): typeof import('node-hid') {
	try {
		return requireHid('node-hid') as typeof import('node-hid')
	} catch (error) {
		throw new Error(
			'Could not load the node-hid native module. The plugin must be installed with its own node_modules directory.',
			{ cause: error },
		)
	}
}

export function listHid(): HidIdentity[] {
	return matchingDevices(
		loadHid()
			.devices()
			.flatMap((device) => identity(device)),
	)
}

export function listPids(): number[] {
	return listHid().map((device) => device.productId)
}

export async function openHid(path: string): Promise<HidPort> {
	const device = await loadHid().HIDAsync.open(path)
	return {
		async write(data: Uint8Array): Promise<void> {
			await device.write(Buffer.from(data))
		},
		async sendFeatureReport(data: Uint8Array): Promise<void> {
			await device.sendFeatureReport(Buffer.from(data))
		},
		/**
		 * A `data` listener is the public way to start `node-hid`'s reader thread. `resume`
		 * calls the native `readStart`, which blocks in `hid_read_timeout` on that thread,
		 * off libuv's pool. A one-shot `read` would hold a pool thread for its whole timeout
		 * and delay every write behind it. `readStart` itself is not on the public handle.
		 */
		async readStart(onReport: (report: Uint8Array) => void): Promise<void> {
			device.on('data', (data: Buffer | undefined) => {
				if (data && data.length > 0) {
					onReport(new Uint8Array(data))
				}
			})
			// An `error` with no listener is thrown by EventEmitter. A failed read is not a
			// report; an unplug shows up as a failed write or a device missing from the watch.
			device.on('error', () => undefined)
			// `on('data')` starts the thread on the next tick, via `resume`. Wait for that
			// tick so the caller can write knowing the reader is already running.
			await new Promise<void>((resolve) => {
				process.nextTick(resolve)
			})
		},
		async close(): Promise<void> {
			await device.close()
		},
	}
}

function identity(device: Device): HidIdentity[] {
	if (!device.path) {
		return []
	}
	return [{ vendorId: device.vendorId, productId: device.productId, path: device.path }]
}
