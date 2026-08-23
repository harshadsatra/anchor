<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AppGroup } from '@shared/types'
import { sortGroups } from '@shared/lib'
import { settings } from '../composables/useSettings'
import { aliasKey, displayName } from '../composables/useAliases'
import WindowRow from './WindowRow.vue'

const props = defineProps<{
  groups: AppGroup[]
  error: string
  query: string
  /** False until the first window-list payload arrives. Without this an empty
   *  groups array reads as "No windows found" during the ~3s first scan. */
  loaded: boolean
  selectedKey: string | null
  editingKey: string | null
}>()

const emit = defineEmits<{
  activate: [appName: string, index: number]
  startEdit: [key: string]
  endEdit: []
}>()

const paneEl = ref<HTMLElement | null>(null)
defineExpose({ paneEl })

const visible = computed<AppGroup[]>(() => {
  const q = props.query.trim().toLowerCase()
  const sorted = sortGroups(props.groups, settings.sort)
  if (!q) return sorted

  return sorted
    .map((g) => {
      if (g.appName.toLowerCase().includes(q)) return g
      // Match the shown name too, so a rename is findable by its new name.
      const windows = g.windows.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          displayName(g.appName, w.title).toLowerCase().includes(q),
      )
      return windows.length ? { ...g, windows } : null
    })
    .filter((g): g is AppGroup => g !== null)
})
</script>

<template>
  <div ref="paneEl" class="pane">
    <div v-if="error" class="empty-state">{{ error }}</div>
    <div v-else-if="!loaded" class="empty-state">Scanning windows…</div>
    <div v-else-if="!visible.length" class="empty-state">
      {{ query ? 'No matches.' : 'No windows found.' }}
    </div>
    <div v-for="group in visible" v-else :key="group.appName" class="group">
      <div class="group-title">
        <img v-if="group.icon" :src="group.icon" alt="" />
        <span v-else class="fallback">{{ group.appName.slice(0, 1).toUpperCase() }}</span>
        <span class="name">{{ group.appName }}</span>
        <span class="count">{{ group.windows.length }}</span>
      </div>
      <WindowRow
        v-for="win in group.windows"
        :key="aliasKey(group.appName, win.title)"
        :app-name="group.appName"
        :win="win"
        :data-key="aliasKey(group.appName, win.title)"
        :selected="selectedKey === aliasKey(group.appName, win.title)"
        :editing="editingKey === aliasKey(group.appName, win.title)"
        @activate="emit('activate', group.appName, win.index)"
        @start-edit="emit('startEdit', aliasKey(group.appName, win.title))"
        @end-edit="emit('endEdit')"
      />
    </div>
  </div>
</template>

<style scoped>
.pane { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 0 8px; }
.group { padding: 3px 0 5px; }
.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  font-size: var(--app-font);
  font-weight: 600;
  color: var(--fg);
}
.group-title img { width: 17px; height: 17px; flex: none; border-radius: 4px; }
.group-title .fallback {
  width: 17px; height: 17px; flex: none;
  border-radius: 4px;
  background: var(--badge);
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.group-title .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-title .count {
  flex: none;
  color: var(--muted);
  font-weight: 600;
  font-size: 10.5px;
  background: var(--badge);
  border-radius: 9px;
  padding: 1px 6px;
}
.empty-state {
  padding: 28px 16px;
  text-align: center;
  color: var(--dim);
  font-size: 12.5px;
  line-height: 1.5;
}
</style>
