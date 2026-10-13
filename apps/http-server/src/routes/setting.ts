import { Router } from 'express'
import { API } from './api_types'
import { ServerOpts } from '../types'
import { scheduleBroadcastMessage } from './event'
import { asyncRouteHandler } from './utils'
import { createSettingsUpdater } from '../settings'

export function createRouter(serverOpts: ServerOpts) {
  const router = Router()
  const updateSettings = createSettingsUpdater(serverOpts)

  async function getSettings(args: API.getSettings.Args): Promise<API.getSettings.Resp> {
    return serverOpts.getSettings()
  }

  async function setSettings(args: API.setSettings.Args): Promise<API.setSettings.Resp> {
    return updateSettings(args)
  }

  router
    .route('/settings')
    .get(
      asyncRouteHandler(async (req, res) => {
        res.json({ payload: await getSettings({}) })
      }),
    )
    .put(
      asyncRouteHandler(async (req, res) => {
        const args = req.body as API.setSettings.Args
        const newSettings = await setSettings(args)

        res.json({ payload: newSettings })

        scheduleBroadcastMessage({
          event: 'settings_change',
          settings: newSettings,
        })
      }),
    )

  return router
}
