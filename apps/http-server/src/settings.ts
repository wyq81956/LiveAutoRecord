import type { Settings } from '@autorecord/shared'
import type { ManagerConfig } from '@autorecord/core'
import type { ServerOpts } from './types'

export class SettingsValidationError extends Error {
  readonly status = 400
}

function requireObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SettingsValidationError('Settings must be an object')
  }
}

export function validateSettingsPatch(value: unknown): asserts value is Partial<Settings> {
  requireObject(value)
  const booleans = [
    'notExitOnAllWindowsClosed',
    'noticeOnRecordStart',
    'debugMode',
    'autoGenerateSRTOnRecordStop',
    'autoRemoveRecordWhenTinySize',
  ]
  const strings = ['noticeFormat', 'locale', 'sortMode']
  for (const [key, field] of Object.entries(value)) {
    if (
      booleans.includes(key) ? typeof field !== 'boolean' : strings.includes(key) ? typeof field !== 'string' : true
    ) {
      throw new SettingsValidationError(`Invalid setting: ${key}`)
    }
  }
}

export function validateManagerPatch(
  value: unknown,
): asserts value is Partial<Omit<ManagerConfig, 'providerAuthConfigs'>> {
  requireObject(value)
  for (const [key, field] of Object.entries(value)) {
    if (key === 'autoCheckInterval') {
      if (typeof field !== 'number' || !Number.isInteger(field) || field < 1 || field > 2_147_483_647) {
        throw new SettingsValidationError('Check interval must be an integer between 1 and 2147483647 milliseconds')
      }
    } else if (['savePathRule', 'ffmpegOutputArgs'].includes(key)) {
      if (typeof field !== 'string' || !field.trim()) throw new SettingsValidationError(`Invalid setting: ${key}`)
    } else if (['autoRemoveSystemReservedChars', 'autoCheckLiveStatusAndRecord'].includes(key)) {
      if (typeof field !== 'boolean') throw new SettingsValidationError(`Invalid setting: ${key}`)
    } else {
      throw new SettingsValidationError(`Unknown manager setting: ${key}`)
    }
  }
}

export function createSettingsUpdater(opts: Pick<ServerOpts, 'getSettings' | 'setSettings'>) {
  let pending: Promise<void> = Promise.resolve()
  return (patch: Partial<Settings>): Promise<Settings> => {
    validateSettingsPatch(patch)
    const snapshot = { ...patch }
    // 串行完成读取、合并和写入，避免并发请求覆盖各自的改动。
    const result = pending.then(async () => opts.setSettings({ ...(await opts.getSettings()), ...snapshot }))
    pending = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
