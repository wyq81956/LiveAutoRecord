import { ErrorRequestHandler, Router } from 'express'
import { router as recorderRoutes } from './recorder'
import { router as recordRoutes } from './record'
import { router as managerRoutes } from './manager'
import { router as eventRoutes } from './event'
import { createRouter as createSettingRouter } from './setting'
import { createRouter as createLoggerRouter } from './logger'
import { createRouter as createProviderRouter } from './provider'
import { ServerOpts } from '../types'
import { SettingsValidationError } from '../settings'

export function createRouter(serverOpts: ServerOpts) {
  const { logger } = serverOpts
  const router = Router()

  router.use(recorderRoutes)
  router.use(recordRoutes)
  router.use(managerRoutes)
  router.use(eventRoutes)
  const settingRoutes = createSettingRouter(serverOpts)
  router.use(settingRoutes)
  const loggerRoutes = createLoggerRouter(serverOpts)
  router.use(loggerRoutes)
  const providerRoutes = createProviderRouter(serverOpts)
  router.use(providerRoutes)

  const handle: ErrorRequestHandler = (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    // 裁剪体积过大的 AxiosError
    if (err != null && typeof err === 'object' && 'isAxiosError' in err) {
      delete err['request']
      delete err['response']
    }

    logger.error('RouterError', err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(err instanceof SettingsValidationError ? 400 : message === '404' ? 404 : 500).json({ error: message })
  }
  router.use(handle)

  return router
}
