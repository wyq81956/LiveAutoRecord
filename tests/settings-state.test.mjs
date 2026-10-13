import assert from 'node:assert/strict'
import { test } from 'node:test'
import { useSettingsState } from '../apps/web/src/views/RecordersManage/settings-state.ts'
import { createSettingsUpdater, validateManagerPatch, validateSettingsPatch } from '../apps/http-server/src/settings.ts'

const defaults = {
  savePathRule: 'default.mp4',
  autoRemoveSystemReservedChars: true,
  autoCheckLiveStatusAndRecord: true,
  autoCheckInterval: 1000,
  ffmpegOutputArgs: '-c copy',
}

function fixture(overrides = {}) {
  let manager = { ...defaults, savePathRule: 'custom.mp4' }
  let settings = { notExitOnAllWindowsClosed: true, noticeOnRecordStart: true, locale: 'zh', sortMode: 'create' }
  const calls = []
  const service = {
    getManager: async () => ({ ...manager }),
    getManagerDefault: async () => ({ ...defaults }),
    getSettings: async () => ({ ...settings }),
    getProviders: async () => [
      { id: 'Bilibili', authFields: [{ key: 'cookie', type: 'textarea' }], hasAuthFlow: true },
    ],
    getProviderAuth: async () => ({ isAuthenticated: true, description: 'user' }),
    updateManager: async (patch) => {
      calls.push(['manager', patch])
      manager = { ...manager, ...patch }
      return { ...manager }
    },
    setSettings: async (patch) => {
      calls.push(['settings', patch])
      settings = { ...settings, ...patch }
      return { ...settings }
    },
    setProviderAuth: async (args) => {
      calls.push(['auth', args])
      return { isAuthenticated: true }
    },
    performProviderLogin: async () => ({ status: { isAuthenticated: true } }),
    clearProviderAuth: async () => {
      calls.push(['clear'])
    },
    ...overrides,
  }
  const applied = []
  const state = useSettingsState(service, 'zh-CN', (result) => applied.push(result))
  return { state, service, calls, applied }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('saved custom settings are clean; reset and language edits are unsaved', async () => {
  const { state } = fixture()
  await state.load()
  assert.equal(state.hasUnsavedChanges.value, false)
  assert.equal(state.differsFromDefaults.value, true)
  state.reset()
  assert.equal(state.hasFormChanges.value, true)
  assert.equal(state.differsFromDefaults.value, false)
  state.manager.value.savePathRule = 'custom.mp4'
  state.innerLocale.value = 'en'
  assert.equal(state.hasFormChanges.value, true)
})

test('saving waits for all writes, blocks duplicate submits, and patches only changed fields', async () => {
  const pending = deferred()
  const { state, service, calls, applied } = fixture()
  await state.load()
  const original = service.setSettings
  service.setSettings = async (patch) => {
    await pending.promise
    return original(patch)
  }
  state.manager.value.autoCheckInterval = 5000
  state.settings.value.noticeOnRecordStart = false
  const result = state.save()
  await Promise.resolve()
  assert.equal(state.saving.value, true)
  assert.equal(state.saveSucceeded.value, false)
  assert.equal(await state.save(), false)
  assert.equal(calls.length, 1)
  pending.resolve()
  assert.equal(await result, true)
  assert.deepEqual(calls, [
    ['manager', { autoCheckInterval: 5000 }],
    ['settings', { noticeOnRecordStart: false }],
  ])
  assert.equal(state.saving.value, false)
  assert.equal(state.hasFormChanges.value, false)
  assert.equal(applied.length, 1)
})

test('partial save failure preserves the unsaved draft and retries only the failed section', async () => {
  const { state, service, calls } = fixture()
  await state.load()
  state.manager.value.autoCheckInterval = 5000
  state.settings.value.noticeFormat = 'custom notice'
  const original = service.setSettings
  service.setSettings = async () => {
    throw { response: { data: { error: 'disk full' } } }
  }
  assert.equal(await state.save(), false)
  assert.equal(state.partiallySaved.value, true)
  assert.equal(state.saveError.value, 'disk full')
  assert.equal(state.settings.value.noticeFormat, 'custom notice')
  assert.equal(state.hasFormChanges.value, true)
  assert.equal(state.saving.value, false)
  service.setSettings = original
  assert.equal(await state.save(), true)
  assert.equal(calls.filter(([kind]) => kind === 'manager').length, 1)
  assert.equal(state.hasFormChanges.value, false)
})

test('failure of the first write keeps both drafts and does not write application settings', async () => {
  const { state, calls } = fixture({
    updateManager: async () => {
      throw new Error('offline')
    },
  })
  await state.load()
  state.manager.value.savePathRule = 'edited.mp4'
  state.settings.value.debugMode = true
  assert.equal(await state.save(), false)
  assert.equal(state.partiallySaved.value, false)
  assert.equal(state.manager.value.savePathRule, 'edited.mp4')
  assert.equal(state.settings.value.debugMode, true)
  assert.deepEqual(calls, [])
})

test('failed sections can be retried without overwriting successfully loaded drafts', async () => {
  const { state, service } = fixture({
    getManager: async () => {
      throw new Error('offline')
    },
  })
  await state.load()
  assert.equal(state.loadErrors.manager, 'offline')
  assert.equal(state.loading.manager, false)
  assert.ok(state.settings.value)
  state.settings.value.debugMode = true
  service.getManager = async () => ({ ...defaults })
  await state.load()
  assert.equal(state.loadErrors.manager, '')
  assert.equal(state.settings.value.debugMode, true)
})

test('empty credentials cannot be submitted, and successful save clears the sensitive draft', async () => {
  const { state, calls } = fixture()
  await state.load()
  state.providerAuthInputs.Bilibili.cookie = '   '
  await state.saveProviderAuth('Bilibili')
  assert.equal(calls.length, 0)
  state.providerAuthInputs.Bilibili.cookie = '  SESSDATA=test  '
  assert.equal(state.hasUnsavedChanges.value, true)
  await state.saveProviderAuth('Bilibili')
  assert.deepEqual(calls[0], ['auth', { id: 'Bilibili', config: { cookie: 'SESSDATA=test' } }])
  assert.equal(state.providerAuthInputs.Bilibili.cookie, '')
  assert.equal(state.hasUnsavedChanges.value, false)
})

test('login excludes clear/save/check operations and failure preserves previous authentication', async () => {
  const pending = deferred()
  const { state, calls } = fixture({ performProviderLogin: () => pending.promise })
  await state.load()
  state.providerAuthInputs.Bilibili.cookie = 'SESSDATA=test'
  const login = state.browserLogin('Bilibili')
  assert.equal(state.authActions.Bilibili, 'login')
  await state.clearProviderAuth('Bilibili')
  await state.saveProviderAuth('Bilibili')
  await state.checkAuth('Bilibili')
  assert.deepEqual(calls, [])
  pending.reject(new Error('window closed'))
  await login
  assert.equal(state.authErrors.Bilibili, 'window closed')
  assert.equal(state.providerAuthStatuses.Bilibili.isAuthenticated, true)
  assert.equal(state.authActions.Bilibili, undefined)
  assert.equal(state.providerAuthInputs.Bilibili.cookie, 'SESSDATA=test')
})

test('invalid intervals and empty paths make no write requests', async () => {
  const { state, calls } = fixture()
  await state.load()
  for (const interval of [0, -1, 1.5, NaN, Infinity, 2147483648, '']) {
    state.manager.value.autoCheckInterval = interval
    assert.equal(await state.save(), false)
    assert.equal(state.validationError.value, 'invalid_check_interval')
  }
  state.manager.value.autoCheckInterval = 1000
  state.manager.value.savePathRule = ' '
  assert.equal(await state.save(), false)
  assert.equal(state.validationError.value, 'save_path_required')
  assert.deepEqual(calls, [])
})

test('concurrent settings patches preserve unrelated fields and recover after failed writes', async () => {
  let stored = { notExitOnAllWindowsClosed: true, noticeOnRecordStart: true, sortMode: 'create' }
  const pending = deferred()
  let first = true
  const update = createSettingsUpdater({
    getSettings: async () => ({ ...stored }),
    setSettings: async (next) => {
      if (first) {
        first = false
        await pending.promise
      }
      stored = next
      return { ...stored }
    },
  })
  const one = update({ noticeFormat: 'custom' })
  const two = update({ sortMode: 'state' })
  pending.resolve()
  await Promise.all([one, two])
  assert.equal(stored.noticeFormat, 'custom')
  assert.equal(stored.sortMode, 'state')
  assert.equal(stored.notExitOnAllWindowsClosed, true)
  let fail = true
  const recover = createSettingsUpdater({
    getSettings: async () => stored,
    setSettings: async (next) => {
      if (fail) {
        fail = false
        throw new Error('disk full')
      }
      stored = next
      return next
    },
  })
  await assert.rejects(recover({ debugMode: true }), /disk full/)
  await recover({ noticeOnRecordStart: false })
  assert.equal(stored.noticeOnRecordStart, false)
})

test('backend rejects invalid settings before accepting a patch', () => {
  for (const value of [null, [], 'invalid', { debugMode: 'true' }, { unknown: true }]) {
    assert.throws(() => validateSettingsPatch(value))
  }
  for (const interval of [0, -1, 1.5, '1000', Infinity, 2147483648]) {
    assert.throws(() => validateManagerPatch({ autoCheckInterval: interval }))
  }
  assert.throws(() => validateManagerPatch({ savePathRule: '' }))
  assert.throws(() => validateManagerPatch({ providerAuthConfigs: {} }))
  validateManagerPatch({ autoCheckInterval: 1000, savePathRule: 'test.mp4' })
  validateSettingsPatch({ noticeFormat: '', debugMode: false })
})
