<template>
  <div class="app-shell">
    <header class="app-header">
      <router-link :to="{ name: 'RecordersManage' }" class="app-brand" aria-label="LiveAutoRecord">
        <span class="brand-mark"><v-icon icon="mdi-record-circle-outline" size="23" /></span>
        <span
          >LiveAutoRecord<span class="brand-caption">{{ $t('ui.workspace') }}</span></span
        >
      </router-link>
      <nav class="app-nav" :aria-label="$t('ui.navigation')">
        <router-link
          v-for="item in navigation"
          :key="item.name"
          :to="{ name: item.name }"
          :class="['app-nav-item', { 'is-active': activeNav === item.name }]"
          :aria-current="activeNav === item.name ? 'page' : undefined"
        >
          <v-icon :icon="item.icon" size="18" /><span>{{ $t(item.label) }}</span>
        </router-link>
      </nav>
      <a
        class="app-source"
        href="https://github.com/wyq81956/LiveAutoRecord"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
        ><v-icon icon="mdi-github" size="22"
      /></a>
    </header>
    <main class="app-main"><router-view /></main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ClientService } from './services/ClientService'

const route = useRoute()
const navigation = [
  { name: 'RecordersManage', icon: 'mdi-video-outline', label: 'ui.recorders_title' },
  { name: 'Records', icon: 'mdi-history', label: 'common.record_history' },
  { name: 'RecordersSetting', icon: 'mdi-tune-variant', label: 'common.settings' },
]
const activeNav = computed(() =>
  route.name === 'RecordersSetting'
    ? 'RecordersSetting'
    : ['Records', 'RecorderRecords', 'Player'].includes(String(route.name))
      ? 'Records'
      : 'RecordersManage',
)

onMounted(() => {
  const clientAPI = ClientService.getClientAPI()
  if (clientAPI) {
    document.title = `LAR 直播自动录制 v${clientAPI.getVersion()}`
  }
})
</script>
