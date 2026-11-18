import { createModuleLogger } from '@companion-surface/base'

/** Companion installs the sink, so these lines reach its log instead of only the process console. */
export const logger = createModuleLogger('MasterHub')
