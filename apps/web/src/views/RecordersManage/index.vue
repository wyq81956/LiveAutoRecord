<template>
  <div class="workspace">
    <div class="workspace-home" :class="{ hidden: currentRouteParentIsRecordersManage }">
      <div class="recorders-page">
        <header class="page-heading">
          <div>
            <span class="page-eyebrow">WORKSPACE</span>
            <h1>{{ $t('ui.recorders_title') }}</h1>
            <p>{{ $t('ui.recorders_description') }}</p>
          </div>
          <v-btn :to="{ name: RouteNames.NewRecorder }" variant="flat" color="primary" prepend-icon="mdi-plus">{{
            $t('recorders.add_channel')
          }}</v-btn>
        </header>
        <div class="recorders-toolbar">
          <v-text-field
            :label="$t('recorders.filter')"
            class="recorders-search"
            v-model="filterText"
            prepend-inner-icon="mdi-magnify"
            hide-details="auto"
            clearable
          />
          <v-select
            :label="$t('recorders.sort')"
            class="recorders-sort"
            v-model="sortMode"
            :items="sortModes"
            :item-title="(item: SortMode) => $t(item.name)"
            :item-value="(item: SortMode) => item"
            hide-details="auto"
          />
        </div>
        <v-alert v-if="loadError" type="error" class="mb-5"
          >{{ loadError
          }}<v-btn variant="text" :loading="loading" @click="loadRecorders">{{ $t('settings.retry') }}</v-btn></v-alert
        >
        <div v-if="loading" class="text-center p-8"><v-progress-circular indeterminate color="primary" /></div>
        <div v-else-if="!displayingRecorders.length && !loadError" class="empty-state">
          <div class="empty-icon"><v-icon icon="mdi-video-outline" size="28" /></div>
          <h2>{{ $t(filterText ? 'ui.no_results' : 'ui.empty_title') }}</h2>
          <p>{{ $t(filterText ? 'ui.no_results_description' : 'ui.empty_description') }}</p>
          <v-btn
            v-if="!filterText"
            :to="{ name: RouteNames.NewRecorder }"
            variant="flat"
            color="primary"
            prepend-icon="mdi-plus"
            >{{ $t('recorders.add_channel') }}</v-btn
          >
        </div>
        <div v-else class="recorders-grid">
          <RecorderCard v-for="recorder in displayingRecorders" :key="recorder.id" :recorder="recorder" />
        </div>
      </div>
    </div>

    <!-- 这个嵌套路由的设计是为了在子页支持路由的情况下，从管理页切换到其他子页时保持管理页的状态（直接上 KeepAlive 感觉会比较 dirty） -->
    <!-- TODO: 这样设计有个缺陷，在子页刷新时，父路由也会在后台加载与请求，可以优化 -->
    <router-view v-slot="{ Component }">
      <!-- showViewIfRouteParentIsRecordersManage -->
      <div v-if="currentRouteParentIsRecordersManage" class="workspace-panel">
        <component :is="Component" />
      </div>
    </router-view>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ClientRecorder } from '@autorecord/http-server'
import { RecorderService } from '../../services/RecorderService'
import RecorderCard from './RecorderCard.vue'
import { RouteNames } from '../../router'
import { assert } from '../../utils'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { LARServerService } from '../../services/LARServerService'

const { t } = useI18n()
const route = useRoute()
const currentRouteParentIsRecordersManage = computed(
  () => route.matched.length >= 2 && route.matched[route.matched.length - 2].name === RouteNames.RecordersManage,
)

const recorders = ref<ClientRecorder[]>([])

type SortMode = {
  id: string
  name: string
  resolver: (recorder: ClientRecorder) => string | number | null
}

const sortModes: SortMode[] = [
  {
    id: 'create',
    name: 'recorders.added_time',
    resolver: (recorder) => recorder.extra.createTimestamp ?? 0,
  },
  {
    id: 'provider',
    name: 'recorder.platform',
    resolver: (recorder) => recorder.providerId,
  },
  {
    id: 'channel',
    name: 'recorder.channel',
    resolver: (recorder) => recorder.channelId,
  },
  {
    id: 'state',
    name: 'recorder.state',
    resolver: (recorder) => {
      return ['recording', 'stopping-record', 'idle'].indexOf(recorder.state)
    },
  },
  {
    id: 'remarks',
    name: 'recorder.remarks',
    resolver: (recorder) => {
      if (recorder.remarks === '') return null
      return recorder.remarks ?? null
    },
  },
]
const sortMode = ref(sortModes[0])
const filterText = ref<string>('')

// TODO: 不知道为啥直接 await 会白屏，先简单实现
let savedSortMode = sortMode.value.id
LARServerService.getSettings({})
  .then((settings) => {
    const mode = sortModes.find((mode) => mode.id === settings.sortMode) ?? sortModes[0]
    savedSortMode = mode.id
    sortMode.value = mode
  })
  .catch(console.error)
watch(sortMode, async ({ id }) => {
  if (id === savedSortMode) return
  try {
    await LARServerService.setSettings({ sortMode: id })
    savedSortMode = id
  } catch (error) {
    console.error(error)
  }
})

const displayingRecorders = computed(() => {
  const fields: (keyof ClientRecorder)[] = ['remarks', 'channelId']
  const result = recorders.value.filter((recorder) =>
    fields.some((field) => recorder[field]?.toString().includes(filterText.value ?? '')),
  )

  assert(sortMode.value)
  const resolver = sortMode.value.resolver
  result.sort((a, b) => {
    const valA = resolver(a)
    const valB = resolver(b)

    // 空值与非空值同时存在，则非空值排序靠前，如果都为空则顺序不变
    if (valA == null || valB == null) {
      if (valA != null) return -1
      if (valB != null) return 1
      return 0
    }

    // 不同类型的值同时存在，则 number 类型的排序靠前
    if (typeof valA === 'number' && typeof valB === 'string') return -1
    if (typeof valA === 'string' && typeof valB === 'number') return 1

    // 正常排序
    if (typeof valA === 'string' && typeof valB === 'string') {
      return valA.localeCompare(valB)
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return valA - valB
    }

    return 0
  })

  return result
})

const loading = ref(true)
const loadError = ref('')
async function loadRecorders() {
  loading.value = true
  loadError.value = ''
  try {
    recorders.value = await RecorderService.getReactiveRecorders()
  } catch (error) {
    loadError.value = t('settings.load_failed', { msg: error instanceof Error ? error.message : String(error) })
  } finally {
    loading.value = false
  }
}
onMounted(loadRecorders)
</script>
