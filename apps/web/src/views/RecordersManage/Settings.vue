<template>
  <div ref="pageElement" class="settings-page">
    <header class="page-heading">
      <div>
        <span class="page-eyebrow">PREFERENCES</span>
        <h1>{{ t('common.settings') }}</h1>
        <p>{{ t('ui.settings_intro') }}</p>
      </div>
      <v-btn variant="text" prepend-icon="mdi-arrow-left" :disabled="busy" @click="leave">{{
        t('ui.back_to_recorders')
      }}</v-btn>
    </header>
    <div class="settings-layout">
      <aside class="settings-sidebar">
        <nav class="settings-nav" :aria-label="t('ui.settings_navigation')">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            :class="{ 'is-active': activeSection === section.id }"
            :aria-current="activeSection === section.id ? 'location' : undefined"
            @click="goToSection(section.id)"
          >
            <v-icon :icon="section.icon" size="18" />{{ t(section.label) }}
          </button>
        </nav>
        <p class="settings-sidebar-note">{{ t('ui.settings_sidebar_note') }}</p>
      </aside>
      <div class="settings-content">
        <v-card id="recording" class="settings-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">{{ t('settings.global_recording_settings') }}</h2>
              <p class="section-description">{{ t('ui.recording_description') }}</p>
            </div>
            <v-btn v-if="differsFromDefaults" size="small" variant="tonal" :disabled="busy" @click="reset">
              {{ t('common.reset') }}
            </v-btn>
          </div>

          <v-card-item>
            <v-alert v-if="loadErrors.manager || loadErrors.defaults" type="error" class="mb-4">
              {{ t('settings.load_failed', { msg: loadErrors.manager || loadErrors.defaults }) }}
              <v-btn variant="text" :loading="loading.manager || loading.defaults" @click="load">{{
                t('settings.retry')
              }}</v-btn>
            </v-alert>
            <div v-if="loading.manager" class="text-center p-4">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <v-form v-else-if="manager" :disabled="saving">
              <v-text-field
                :label="t('settings.save_path_rule')"
                v-model="manager.savePathRule"
                append-inner-icon="mdi-help-circle"
                @click:append-inner="savePathRuleAlertVisible = !savePathRuleAlertVisible"
                hide-details
              />
              <v-alert v-model="savePathRuleAlertVisible" closable>
                <v-alert-title>{{ t('settings.spr_alert_title') }}</v-alert-title>
                <p class="text-subtitle-1 m-2">{{ t('settings.spr_alert_subtitle') }}</p>
                <v-table>
                  <thead>
                    <tr>
                      <th class="text-left">{{ t('settings.filed_name') }}</th>
                      <th class="text-left">{{ t('settings.filed_value') }}</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>platform</td>
                      <td>{{ t('settings.field_platform_hint') }}</td>
                    </tr>
                    <tr>
                      <td>channelId</td>
                      <td>{{ t('settings.field_channel_hint') }}</td>
                    </tr>
                    <tr>
                      <td>title</td>
                      <td>{{ t('settings.field_title_hint') }}</td>
                    </tr>
                    <tr>
                      <td>owner</td>
                      <td>{{ t('settings.field_owner_hint') }}</td>
                    </tr>
                    <tr>
                      <td>remarks</td>
                      <td>{{ t('settings.field_remarks_hint') }}</td>
                    </tr>
                    <tr>
                      <td>year</td>
                      <td>{{ t('settings.field_year_hint') }}</td>
                    </tr>
                    <tr>
                      <td>month</td>
                      <td>{{ t('settings.field_month_hint') }}</td>
                    </tr>
                    <tr>
                      <td>date</td>
                      <td>{{ t('settings.field_date_hint') }}</td>
                    </tr>
                    <tr>
                      <td>hour</td>
                      <td>{{ t('settings.field_hour_hint') }}</td>
                    </tr>
                    <tr>
                      <td>min</td>
                      <td>{{ t('settings.field_min_hint') }}</td>
                    </tr>
                    <tr>
                      <td>sec</td>
                      <td>{{ t('settings.field_sec_hint') }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </v-alert>

              <SettingsToggle
                :label="t('settings.auto_remove_reserved_chars')"
                :description="t('ui.reserved_chars_description')"
                v-model="manager.autoRemoveSystemReservedChars"
                :disabled="saving"
              />

              <v-text-field :label="t('settings.ffmpeg_output_args')" v-model="manager.ffmpegOutputArgs" />

              <SettingsToggle
                :label="t('settings.auto_check_and_record')"
                :description="t('ui.auto_record_description')"
                v-model="manager.autoCheckLiveStatusAndRecord"
                :disabled="saving"
              />

              <v-text-field
                v-if="manager.autoCheckLiveStatusAndRecord"
                :label="t('settings.check_interval')"
                v-model.number="manager.autoCheckInterval"
                type="number"
                min="1"
                max="2147483647"
                step="1"
              />
            </v-form>
          </v-card-item>
        </v-card>
        <v-card id="application" class="settings-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">{{ t('settings.app_settings') }}</h2>
              <p class="section-description">{{ t('ui.application_description') }}</p>
            </div>
            <v-icon icon="mdi-tune-variant" color="grey" size="20" />
          </div>

          <v-card-item>
            <v-alert v-if="loadErrors.settings" type="error" class="mb-4">
              {{ t('settings.load_failed', { msg: loadErrors.settings }) }}
              <v-btn variant="text" :loading="loading.settings" @click="load">{{ t('settings.retry') }}</v-btn>
            </v-alert>
            <div v-if="loading.settings" class="text-center p-4">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <v-form v-else-if="settings" :disabled="saving">
              <v-select
                label="语言 - Language"
                class="mb-2"
                v-model="innerLocale"
                density="comfortable"
                :items="[
                  { name: '简体中文', value: 'zh' },
                  { name: 'Русский язык', value: 'ru' },
                  { name: 'English', value: 'en' },
                ]"
                item-title="name"
                item-value="value"
                hide-details="auto"
              />

              <SettingsToggle
                v-if="isClient"
                :label="t('settings.close_to_tray')"
                v-model="settings.notExitOnAllWindowsClosed"
                :disabled="saving"
              />

              <SettingsToggle
                :label="t('settings.auto_generate_srt')"
                v-model="settings.autoGenerateSRTOnRecordStop"
                :disabled="saving"
              />

              <SettingsToggle
                :label="t('settings.auto_remove_empty_record')"
                v-model="settings.autoRemoveRecordWhenTinySize"
                :disabled="saving"
              />

              <SettingsToggle
                :label="t('settings.notify_when_record_start')"
                :description="t('ui.notifications_description')"
                v-model="settings.noticeOnRecordStart"
                :disabled="saving"
              />

              <v-text-field
                v-if="settings.noticeOnRecordStart"
                :label="t('settings.notice_format')"
                v-model="settings.noticeFormat"
                persistent-placeholder
                :placeholder="t('settings.default_notice_format')"
                append-inner-icon="mdi-help-circle"
                @click:append-inner="noticeFormatAlertVisible = !noticeFormatAlertVisible"
              />
              <v-alert v-model="noticeFormatAlertVisible" closable>
                <v-alert-title>{{ t('settings.nf_alert_title') }}</v-alert-title>
                <p class="text-subtitle-1 m-2">{{ t('settings.nf_alert_subtitle') }}</p>
                <v-table>
                  <thead>
                    <tr>
                      <th class="text-left">{{ t('settings.filed_name') }}</th>
                      <th class="text-left">{{ t('settings.filed_value') }}</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>platform</td>
                      <td>{{ t('settings.field_platform_hint') }}</td>
                    </tr>
                    <tr>
                      <td>channelId</td>
                      <td>{{ t('settings.field_channel_hint') }}</td>
                    </tr>
                    <tr>
                      <td>remarks</td>
                      <td>{{ t('settings.field_remarks_hint') }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </v-alert>

              <SettingsToggle
                :label="t('settings.debug_mode')"
                :description="t('ui.debug_description')"
                v-model="settings.debugMode"
                :disabled="saving"
              />
            </v-form>
          </v-card-item>
        </v-card>
        <v-card id="authentication" class="settings-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">{{ t('settings.provider_auth') }}</h2>
              <p class="section-description">{{ t('ui.authentication_description') }}</p>
            </div>
            <v-icon icon="mdi-shield-check-outline" color="grey" size="20" />
          </div>

          <v-card-item>
            <v-alert v-if="loadErrors.providers" type="error" class="mb-4">
              {{ t('settings.load_failed', { msg: loadErrors.providers }) }}
              <v-btn variant="text" :loading="loading.providers" @click="load">{{ t('settings.retry') }}</v-btn>
            </v-alert>
            <div v-if="loading.providers" class="text-center p-4">
              <v-progress-circular indeterminate color="primary" />
            </div>

            <div v-else-if="providers">
              <p class="section-description">{{ t('settings.auth_saved_separately') }}</p>
              <div v-for="provider in providersWithAuth" :key="provider.id" class="provider-panel">
                <div class="provider-heading">
                  <h3><v-icon icon="mdi-account-circle-outline" size="18" />{{ t(`platform_name.${provider.id}`) }}</h3>

                  <v-chip
                    :color="
                      authErrors[provider.id]
                        ? 'error'
                        : providerAuthStatuses[provider.id]?.isAuthenticated
                          ? 'success'
                          : 'default'
                    "
                    size="small"
                  >
                    {{
                      authActions[provider.id]
                        ? t(
                            authActions[provider.id] === 'login'
                              ? 'settings.auth_logging_in'
                              : 'settings.auth_processing',
                          )
                        : authErrors[provider.id]
                          ? t('settings.auth_check_failed')
                          : !providerAuthStatuses[provider.id]
                            ? t('settings.auth_unknown')
                            : providerAuthStatuses[provider.id]?.isAuthenticated
                              ? t('settings.auth_logged_in', { name: providerAuthStatuses[provider.id]?.description })
                              : t('settings.auth_not_logged_in')
                    }}
                  </v-chip>
                </div>
                <p v-if="providerAuthStatuses[provider.id]?.description" class="provider-description">
                  {{ providerAuthStatuses[provider.id].description }}
                </p>
                <v-alert v-if="authErrors[provider.id]" type="error" class="mb-2">
                  {{ authErrors[provider.id] }}
                </v-alert>

                <template v-for="field in provider.authFields" :key="field.key">
                  <v-textarea
                    v-if="field.type === 'textarea'"
                    :label="field.label"
                    :placeholder="field.placeholder"
                    v-model="providerAuthInputs[provider.id][field.key]"
                    :disabled="saving || !!authActions[provider.id]"
                    rows="2"
                    auto-grow
                    hide-details
                    class="mb-2"
                  />
                  <v-text-field
                    v-else
                    :label="field.label"
                    :placeholder="field.placeholder"
                    :type="field.type === 'password' ? 'password' : 'text'"
                    v-model="providerAuthInputs[provider.id][field.key]"
                    :disabled="saving || !!authActions[provider.id]"
                    hide-details
                    class="mb-2"
                  />
                </template>

                <div class="provider-actions">
                  <v-btn
                    size="small"
                    variant="flat"
                    color="primary"
                    @click="saveProviderAuth(provider.id)"
                    :loading="authActions[provider.id] === 'save'"
                    :disabled="saving || !!authActions[provider.id] || !canSaveAuth(provider.id)"
                  >
                    {{ t('settings.auth_save') }}
                  </v-btn>
                  <v-btn
                    v-if="provider.hasAuthFlow"
                    size="small"
                    variant="tonal"
                    @click="browserLogin(provider.id)"
                    :loading="authActions[provider.id] === 'login'"
                    :disabled="saving || !!authActions[provider.id]"
                  >
                    {{ t('settings.auth_browser_login') }}
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="text"
                    @click="clearProviderAuth(provider.id)"
                    :loading="authActions[provider.id] === 'clear'"
                    :disabled="saving || !!authActions[provider.id]"
                  >
                    {{ t('settings.auth_clear') }}
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="text"
                    :disabled="saving || !!authActions[provider.id]"
                    @click="checkAuth(provider.id)"
                  >
                    {{ t('settings.auth_recheck') }}
                  </v-btn>
                </div>
              </div>
            </div>
          </v-card-item>
        </v-card>
        <v-card id="about" class="settings-section">
          <div class="section-header">
            <div>
              <h2 class="section-title">{{ t('settings.about') }}</h2>
              <p class="section-description">LiveAutoRecord · {{ t('ui.workspace') }}</p>
            </div>
            <v-icon icon="mdi-information-outline" color="grey" size="20" />
          </div>

          <v-card-item>
            <v-table class="about-table">
              <tbody>
                <tr>
                  <td>{{ t('settings.version') }}</td>
                  <td>{{ version ? `v${version}` : t('ui.web_version') }}</td>
                </tr>
                <tr>
                  <td>{{ t('settings.open_source') }}</td>
                  <td>
                    <a href="https://github.com/wyq81956/LiveAutoRecord" target="_blank">
                      https://github.com/wyq81956/LiveAutoRecord
                    </a>
                  </td>
                </tr>
                <tr>
                  <td>{{ t('settings.feedback') }}</td>
                  <td>
                    <a href="https://github.com/wyq81956/LiveAutoRecord/issues" target="_blank">
                      https://github.com/wyq81956/LiveAutoRecord/issues
                    </a>
                  </td>
                </tr>
                <tr>
                  <td>{{ t('settings.author') }}</td>
                  <td>
                    <a href="https://space.bilibili.com/23505769" target="_blank">WhiteMind</a>
                  </td>
                </tr>
                <tr>
                  <td>{{ t('settings.email') }}</td>
                  <td>whitemind@qq.com</td>
                </tr>
              </tbody>
            </v-table>
          </v-card-item>
        </v-card>
      </div>
    </div>
    <footer class="settings-savebar">
      <Transition name="feedback" mode="out-in">
        <v-alert v-if="validationError" key="validation" type="error" class="mb-3" role="alert">{{
          t(`settings.${validationError}`)
        }}</v-alert>
        <v-alert v-else-if="saveError" key="error" type="error" class="mb-3" role="alert">
          {{ t(partiallySaved ? 'settings.partial_save_failed' : 'settings.save_failed', { msg: saveError }) }}
        </v-alert>
        <v-alert v-else-if="saveSucceeded && !hasFormChanges" key="success" type="success" class="mb-3" role="status">{{
          t('settings.save_success')
        }}</v-alert>
      </Transition>
      <div class="settings-savebar-actions">
        <span :class="['savebar-status', { 'is-dirty': hasFormChanges }]" role="status" aria-live="polite"
          ><span class="savebar-dot" />{{
            saving
              ? t('ui.saving')
              : !ready
                ? t(loading.manager || loading.settings ? 'ui.loading_settings' : 'ui.settings_unavailable')
                : hasFormChanges
                  ? t('settings.unsaved_changes')
                  : t('ui.no_changes')
          }}</span
        >
        <div class="savebar-buttons">
          <v-btn @click="leave" :disabled="busy" variant="text">{{ t('common.cancel') }}</v-btn>
          <v-btn
            @click="save"
            variant="flat"
            color="primary"
            prepend-icon="mdi-check"
            :loading="saving"
            :disabled="busy || !ready || !hasFormChanges"
            >{{ t('common.apply') }}</v-btn
          >
        </div>
      </div>
    </footer>
    <v-dialog v-model="leaveDialogVisible" max-width="420">
      <v-card>
        <v-card-title>{{ t('settings.unsaved_changes') }}</v-card-title>
        <v-card-text>{{ t('settings.discard_changes_question') }}</v-card-text>
        <v-card-actions class="justify-end">
          <v-btn @click="leaveDialogVisible = false">{{ t('settings.continue_editing') }}</v-btn>
          <v-btn color="error" @click="discardAndLeave">{{ t('settings.discard_changes') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { LARServerService } from '../../services/LARServerService'
import { ClientService } from '../../services/ClientService'
import { RecordService } from '../../services/RecordService'
import { useEffectInLifecycle } from '../../hooks'
import { InteractionService } from '../../services/InteractionService'
import { i18nOpts } from '../../i18n'
import { useSettingsState } from './settings-state'
import SettingsToggle from '../../components/SettingsToggle.vue'

const pageElement = ref<HTMLElement>()
const activeSection = ref('recording')
const sections = [
  { id: 'recording', icon: 'mdi-video-outline', label: 'ui.recording_nav' },
  { id: 'application', icon: 'mdi-tune-variant', label: 'settings.app_settings' },
  { id: 'authentication', icon: 'mdi-shield-check-outline', label: 'settings.provider_auth' },
  { id: 'about', icon: 'mdi-information-outline', label: 'ui.about_nav' },
]
function goToSection(id: string) {
  activeSection.value = id
  pageElement.value?.querySelector(`#${id}`)?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'start',
  })
}
let sectionObserver: IntersectionObserver | undefined
onMounted(() => {
  sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeSection.value = visible[0].target.id
    },
    { root: pageElement.value?.closest('.workspace-panel'), rootMargin: '-8% 0px -65% 0px', threshold: 0 },
  )
  pageElement.value?.querySelectorAll('.settings-section').forEach((element) => sectionObserver?.observe(element))
})
onUnmounted(() => sectionObserver?.disconnect())

const isClient = ClientService.isClientMode()
const version = ClientService.getClientAPI()?.getVersion()
const router = useRouter()
const savePathRuleAlertVisible = ref(false)
const noticeFormatAlertVisible = ref(false)
const { locale: appLocale } = useI18n()
const { t, locale: previewLocale } = useI18n({ ...i18nOpts, locale: appLocale.value, inheritLocale: false })
const {
  manager,
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
} = useSettingsState(LARServerService, appLocale.value, (newSettings) => {
  RecordService.noticeOnRecordStart = newSettings.noticeOnRecordStart
  RecordService.noticeFormat = newSettings.noticeFormat ?? ''
  appLocale.value = newSettings.locale ?? appLocale.value
})
watch(
  innerLocale,
  (locale) => {
    previewLocale.value = locale
  },
  { immediate: true },
)

const leaveDialogVisible = ref(false)
let confirmLeave: ((discard: boolean) => void) | undefined
onBeforeRouteLeave(() => {
  if (busy.value) return false
  if (!hasUnsavedChanges.value) return true
  if (confirmLeave) return false
  leaveDialogVisible.value = true
  return new Promise<boolean>((resolve) => {
    confirmLeave = resolve
  })
})
watch(leaveDialogVisible, (visible) => {
  if (!visible && confirmLeave) {
    confirmLeave(false)
    confirmLeave = undefined
  }
})
function discardAndLeave() {
  const resolve = confirmLeave
  confirmLeave = undefined
  leaveDialogVisible.value = false
  resolve?.(true)
}
function leave() {
  if (!busy.value) void router.push({ name: 'RecordersManage' })
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value && !busy.value) return
  event.preventDefault()
  event.returnValue = ''
}
useEffectInLifecycle(() => {
  window.addEventListener('beforeunload', beforeUnload)
  const stopEscape = InteractionService.onEscapeWhenBody(leave)
  return () => {
    window.removeEventListener('beforeunload', beforeUnload)
    stopEscape()
  }
})
onMounted(load)
onUnmounted(() => {
  confirmLeave?.(false)
})
</script>
