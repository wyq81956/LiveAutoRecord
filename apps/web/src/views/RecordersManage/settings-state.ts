import { computed, reactive, ref } from 'vue'
import type { API } from '@autorecord/http-server'
import type { LARServerService } from '../../services/LARServerService'

type SettingsService = Pick<
  typeof LARServerService,
  | 'getManager'
  | 'getManagerDefault'
  | 'getSettings'
  | 'getProviders'
  | 'getProviderAuth'
  | 'updateManager'
  | 'setSettings'
  | 'setProviderAuth'
  | 'performProviderLogin'
  | 'clearProviderAuth'
>
type AuthAction = 'check' | 'save' | 'login' | 'clear'

export function getErrorMessage(error: unknown): string {
  const responseError = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  if (typeof responseError === 'string') return responseError
  return error instanceof Error ? error.message : String(error)
}

function changedFields<T extends object>(draft: T, saved: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(draft).filter(([key, value]) => value !== saved[key as keyof T]),
  ) as Partial<T>
}

export function normalizeLocale(locale: string): 'zh' | 'en' | 'ru' {
  const language = locale.toLowerCase().split(/[-_]/)[0]
  return language === 'zh' || language === 'en' || language === 'ru' ? language : 'en'
}

export function useSettingsState(
  service: SettingsService,
  initialLocale: string,
  onSettingsSaved: (settings: API.getSettings.Resp) => void,
) {
  const manager = ref<API.getManager.Resp>()
  const managerDefault = ref<API.getManagerDefault.Resp>()
  const settings = ref<API.getSettings.Resp>()
  const savedManager = ref<API.getManager.Resp>()
  const savedSettings = ref<API.getSettings.Resp>()
  const innerLocale = ref(normalizeLocale(initialLocale))
  const loading = reactive({ manager: false, defaults: false, settings: false, providers: false })
  const loadErrors = reactive({ manager: '', defaults: '', settings: '', providers: '' })
  const saving = ref(false)
  const saveError = ref('')
  const saveSucceeded = ref(false)
  const partiallySaved = ref(false)
  const validationError = ref('')
  const providers = ref<API.getProviders.Resp>()
  const providerAuthStatuses = reactive<Record<string, API.getProviderAuth.Resp>>({})
  const providerAuthInputs = reactive<Record<string, Record<string, string>>>({})
  const authActions = reactive<Record<string, AuthAction | undefined>>({})
  const authErrors = reactive<Record<string, string>>({})
  const providersWithAuth = computed(() => (providers.value ?? []).filter((p) => p.authFields?.length))
  const authBusy = computed(() => Object.values(authActions).some(Boolean))
  const busy = computed(() => saving.value || authBusy.value)
  const settingsDraft = computed(() => settings.value && { ...settings.value, locale: innerLocale.value })
  const managerChanges = computed(() =>
    manager.value && savedManager.value ? changedFields(manager.value, savedManager.value) : {},
  )
  const settingsChanges = computed(() =>
    settingsDraft.value && savedSettings.value ? changedFields(settingsDraft.value, savedSettings.value) : {},
  )
  const hasFormChanges = computed(
    () => Object.keys(managerChanges.value).length > 0 || Object.keys(settingsChanges.value).length > 0,
  )
  const hasAuthDrafts = computed(() =>
    Object.values(providerAuthInputs).some((inputs) => Object.values(inputs).some((value) => value.trim())),
  )
  const hasUnsavedChanges = computed(() => hasFormChanges.value || hasAuthDrafts.value)
  const differsFromDefaults = computed(
    () =>
      !!manager.value &&
      !!managerDefault.value &&
      Object.keys(changedFields(manager.value, managerDefault.value)).length > 0,
  )
  const ready = computed(() => !!manager.value && !!settings.value)

  async function loadSection(key: keyof typeof loading, load: () => Promise<void>) {
    if (loading[key]) return
    loading[key] = true
    loadErrors[key] = ''
    try {
      await load()
    } catch (error) {
      loadErrors[key] = getErrorMessage(error)
    } finally {
      loading[key] = false
    }
  }

  async function runAuth(providerId: string, action: AuthAction, run: () => Promise<void>) {
    if (saving.value || authActions[providerId]) return
    authActions[providerId] = action
    authErrors[providerId] = ''
    try {
      await run()
    } catch (error) {
      // 操作失败不覆盖已有的登录状态，错误另行显示。
      authErrors[providerId] = getErrorMessage(error)
    } finally {
      authActions[providerId] = undefined
    }
  }

  function clearAuthInputs(providerId: string) {
    for (const key of Object.keys(providerAuthInputs[providerId] ?? {})) providerAuthInputs[providerId][key] = ''
  }

  async function load() {
    // 重试只加载失败的区域，不覆盖用户已经编辑的草稿。
    await Promise.allSettled([
      !manager.value &&
        loadSection('manager', async () => {
          const result = await service.getManager({})
          manager.value = { ...result }
          savedManager.value = { ...result }
        }),
      !managerDefault.value &&
        loadSection('defaults', async () => {
          managerDefault.value = await service.getManagerDefault({})
        }),
      !settings.value &&
        loadSection('settings', async () => {
          const result = await service.getSettings({})
          innerLocale.value = normalizeLocale(result.locale ?? initialLocale)
          settings.value = { ...result, locale: innerLocale.value }
          savedSettings.value = { ...settings.value }
        }),
      !providers.value &&
        loadSection('providers', async () => {
          const result = await service.getProviders()
          for (const provider of result) {
            providerAuthInputs[provider.id] = Object.fromEntries(
              (provider.authFields ?? []).map((field) => [field.key, '']),
            )
          }
          providers.value = result
          await Promise.allSettled(providersWithAuth.value.map((provider) => checkAuth(provider.id)))
        }),
    ])
  }

  function validate(): boolean {
    validationError.value = ''
    if (!manager.value?.savePathRule?.trim()) validationError.value = 'save_path_required'
    else if (!manager.value.ffmpegOutputArgs?.trim()) validationError.value = 'ffmpeg_args_required'
    else {
      const interval = Number(manager.value.autoCheckInterval)
      if (!Number.isInteger(interval) || interval < 1 || interval > 2_147_483_647) {
        validationError.value = 'invalid_check_interval'
      } else manager.value.autoCheckInterval = interval
    }
    return !validationError.value
  }

  async function save(): Promise<boolean> {
    if (busy.value || !ready.value || !hasFormChanges.value || !validate()) return false
    saving.value = true
    saveError.value = ''
    saveSucceeded.value = false
    partiallySaved.value = false
    let savedAny = false
    try {
      if (Object.keys(managerChanges.value).length) {
        const result = await service.updateManager({ ...managerChanges.value })
        manager.value = { ...result }
        savedManager.value = { ...result }
        savedAny = true
      }
      if (Object.keys(settingsChanges.value).length) {
        // 仅提交改动字段，避免覆盖其他页面或标签页修改的设置。
        const result = await service.setSettings({ ...settingsChanges.value })
        settings.value = { ...result }
        innerLocale.value = normalizeLocale(result.locale ?? initialLocale)
        savedSettings.value = { ...result, locale: innerLocale.value }
        onSettingsSaved(result)
      }
      saveSucceeded.value = true
      return true
    } catch (error) {
      partiallySaved.value = savedAny
      saveError.value = getErrorMessage(error)
      return false
    } finally {
      saving.value = false
    }
  }

  function reset() {
    if (busy.value || !managerDefault.value) return
    manager.value = { ...managerDefault.value }
    validationError.value = ''
    saveSucceeded.value = false
  }

  function canSaveAuth(providerId: string) {
    const inputs = providerAuthInputs[providerId] ?? {}
    const fields = providers.value?.find((p) => p.id === providerId)?.authFields ?? []
    return (
      Object.values(inputs).some((value) => value.trim()) &&
      fields.every((field) => !field.required || inputs[field.key]?.trim())
    )
  }

  async function checkAuth(providerId: string) {
    await runAuth(providerId, 'check', async () => {
      providerAuthStatuses[providerId] = await service.getProviderAuth({ id: providerId })
    })
  }

  async function saveProviderAuth(providerId: string) {
    if (!canSaveAuth(providerId)) return
    await runAuth(providerId, 'save', async () => {
      const config = Object.fromEntries(
        Object.entries(providerAuthInputs[providerId]).map(([key, value]) => [key, value.trim()]),
      )
      providerAuthStatuses[providerId] = await service.setProviderAuth({ id: providerId, config })
      clearAuthInputs(providerId)
    })
  }

  async function browserLogin(providerId: string) {
    await runAuth(providerId, 'login', async () => {
      const result = await service.performProviderLogin({ id: providerId })
      providerAuthStatuses[providerId] = result.status
    })
  }

  async function clearProviderAuth(providerId: string) {
    await runAuth(providerId, 'clear', async () => {
      await service.clearProviderAuth({ id: providerId })
      providerAuthStatuses[providerId] = { isAuthenticated: false }
      clearAuthInputs(providerId)
    })
  }

  return {
    manager,
    managerDefault,
    settings,
    innerLocale,
    loading,
    loadErrors,
    saving,
    saveError,
    saveSucceeded,
    partiallySaved,
    validationError,
    providers,
    providersWithAuth,
    providerAuthStatuses,
    providerAuthInputs,
    authActions,
    authErrors,
    authBusy,
    busy,
    hasFormChanges,
    hasUnsavedChanges,
    differsFromDefaults,
    ready,
    load,
    save,
    reset,
    canSaveAuth,
    checkAuth,
    saveProviderAuth,
    browserLogin,
    clearProviderAuth,
  }
}
