<template>
  <div class="settings-toggle-row">
    <div class="settings-toggle-copy">
      <label :for="inputId">{{ label }}</label>
      <p v-if="description">{{ description }}</p>
    </div>
    <v-switch
      :id="inputId"
      v-model="model"
      :label="label"
      :aria-label="label"
      :disabled="disabled"
      class="settings-toggle"
    />
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'
defineProps<{ label: string; description?: string; disabled?: boolean }>()
const model = defineModel<boolean | undefined>()
const inputId = useId()
</script>
