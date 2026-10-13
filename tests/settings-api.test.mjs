import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import express from 'express'

test('settings API preserves authentication and returns actionable errors', async (t) => {
  const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { paths } = await import('@autorecord/core')
  const temporary = await mkdtemp(path.join(workspace, 'tests', '.settings-api-'))
  const originalPaths = { ...paths }
  Object.assign(paths, { config: temporary, data: temporary })
  let server
  try {
    const configPath = path.join(temporary, 'manager.json')
    await writeFile(
      configPath,
      JSON.stringify({
        savePathRule: path.join(temporary, 'record.mp4'),
        autoRemoveSystemReservedChars: true,
        autoCheckLiveStatusAndRecord: false,
        autoCheckInterval: 1000,
        ffmpegOutputArgs: '-c copy',
        providerAuthConfigs: { Bilibili: { cookie: 'SESSDATA=original-test-value' } },
      }),
    )
    const result = await build({
      stdin: {
        contents: `
        export { createRouter } from './apps/http-server/src/routes/index.ts'
        export { initRecorderManager, recorderManager } from './apps/http-server/src/manager.ts'
        export { initDB } from './apps/http-server/src/db/index.ts'
      `,
        resolveDir: workspace,
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      write: false,
    })
    const compiledPath = path.join(temporary, 'settings-api.mjs')
    await writeFile(compiledPath, result.outputFiles[0].text)
    const { createRouter, initRecorderManager, recorderManager, initDB } = await import(
      pathToFileURL(compiledPath).href
    )
    let stored = { notExitOnAllWindowsClosed: true, noticeOnRecordStart: true, sortMode: 'state' }
    let failWrite = false
    const opts = {
      getSettings: async () => ({ ...stored }),
      setSettings: async (next) => {
        if (failWrite) throw new Error('test write failed')
        stored = next
        return next
      },
      logger: { info() {}, error() {}, debug() {}, warn() {} },
    }
    await initDB(opts)
    await initRecorderManager(opts)
    const provider = recorderManager.providers.find((p) => p.id === 'Bilibili')
    provider.checkAuth = async () => ({ isAuthenticated: true })
    const app = express()
    app.use(express.json())
    app.use('/api', createRouter(opts))
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const baseURL = `http://127.0.0.1:${server.address().port}/api`
    const request = (url, method, body) =>
      fetch(baseURL + url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      })
    const readConfig = async () => JSON.parse(await readFile(configPath, 'utf8'))

    await t.test('manager edits preserve the latest Cookie and do not resurrect cleared authentication', async () => {
      assert.equal((await request('/manager', 'PATCH', { autoCheckInterval: 5000 })).status, 200)
      assert.equal((await readConfig()).providerAuthConfigs.Bilibili.cookie, 'SESSDATA=original-test-value')
      assert.equal(
        (await request('/providers/Bilibili/auth', 'PUT', { config: { cookie: 'SESSDATA=new-test-value' } })).status,
        200,
      )
      await request('/manager', 'PATCH', { ffmpegOutputArgs: '-c copy -movflags frag_keyframe' })
      assert.equal((await readConfig()).providerAuthConfigs.Bilibili.cookie, 'SESSDATA=new-test-value')
      await request('/providers/Bilibili/auth', 'DELETE')
      await request('/manager', 'PATCH', { autoCheckInterval: 6000 })
      assert.equal((await readConfig()).providerAuthConfigs.Bilibili, undefined)
    })

    await t.test('empty credentials cannot replace a saved Cookie', async () => {
      await request('/providers/Bilibili/auth', 'PUT', { config: { cookie: 'SESSDATA=keep-test-value' } })
      assert.equal((await request('/providers/Bilibili/auth', 'PUT', { config: { cookie: ' ' } })).status, 400)
      assert.equal((await readConfig()).providerAuthConfigs.Bilibili.cookie, 'SESSDATA=keep-test-value')
    })

    await t.test('settings patches preserve unrelated values and invalid inputs return 400', async () => {
      const response = await request('/settings', 'PUT', { noticeFormat: 'custom notice' })
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.payload.sortMode, 'state')
      assert.equal(body.payload.noticeFormat, 'custom notice')
      assert.equal((await request('/settings', 'PUT', { debugMode: 'yes' })).status, 400)
      assert.equal((await request('/manager', 'PATCH', { autoCheckInterval: 0 })).status, 400)
      assert.equal((await readConfig()).autoCheckInterval, 6000)
    })

    await t.test('write failures return JSON errors instead of hanging, and the next save can succeed', async () => {
      failWrite = true
      const response = await request('/settings', 'PUT', { debugMode: true })
      assert.equal(response.status, 500)
      assert.equal((await response.json()).error, 'test write failed')
      failWrite = false
      assert.equal((await request('/settings', 'PUT', { debugMode: true })).status, 200)
      assert.equal(stored.debugMode, true)
    })
    recorderManager.stopCheckLoop()
  } finally {
    if (server) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    Object.assign(paths, originalPaths)
    // 仅删除 mkdtemp 在项目 tests 目录中创建的测试目录。
    assert.equal(path.dirname(path.resolve(temporary)), path.join(workspace, 'tests'))
    assert.ok(path.basename(temporary).startsWith('.settings-api-'))
    await rm(temporary, { recursive: true, force: true })
  }
})
