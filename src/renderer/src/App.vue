<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { AppGroup, ShortcutStatus } from '@shared/types'
import { sortGroups } from '@shared/lib'
import { settings, useSettingsEffects } from './composables/useSettings'
import { aliasKey, displayName } from './composables/useAliases'
import WindowsTab from './components/WindowsTab.vue'
import SettingsTab from './components/SettingsTab.vue'

useSettingsEffects()

type Tab = 'windows' | 'settings'

const tab = ref<Tab>('windows')
const groups = ref<AppGroup[]>([])
const error = ref('')
const query = ref('')
const shortcut = ref<ShortcutStatus | null>(null)
const editingKey = ref<string | null>(null)
const selectedKey = ref<string | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
const windowsTab = ref<InstanceType<typeof WindowsTab> | null>(null)

/** Flat list of visible row keys, in render order — what the arrows walk. */
const visibleKeys = computed<{ key: string; appName: string; index: number }[]>(() => {
  const q = query.value.trim().toLowerCase()
  const out: { key: string; appName: string; index: number }[] = []
  for (const g of sortGroups(groups.value, settings.sort)) {
    const appMatches = !q || g.appName.toLowerCase().includes(q)
    for (const w of g.windows) {
      const matches =
        appMatches ||
        w.title.toLowerCase().includes(q) ||
        displayName(g.appName, w.title).toLowerCase().includes(q)
      if (matches) out.push({ key: aliasKey(g.appName, w.title), appName: g.appName, index: w.index })
    }
  }
  return out
})

async function showTab(next: Tab): Promise<void> {
  tab.value = next
  if (next === 'windows') {
    await nextTick()
    searchEl.value?.focus()
  }
}

function activate(appName: string, index: number): void {
  window.api.focusWindow(appName, index)
}

function moveSelection(delta: number): void {
  const list = visibleKeys.value
  if (!list.length) return
  const cur = list.findIndex((r) => r.key === selectedKey.value)
  const next = (cur + delta + list.length) % list.length
  selectedKey.value = list[next].key
  nextTick(() => {
    windowsTab.value?.paneEl
      ?.querySelector(`[data-key="${CSS.escape(list[next].key)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(e: KeyboardEvent): void {
  if (editingKey.value) return // the rename input owns the keyboard

  if (tab.value === 'settings') {
    if (e.metaKey || e.ctrlKey || e.altKey) return // real shortcuts pass through
    if (e.key === 'Escape') {
      window.api.hidePopover()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      showTab('windows') // then fall through to the nav below
    } else if (e.key.length === 1 && e.key !== ' ') {
      // Typing is meant for the filter, so jump back and keep the keystroke.
      e.preventDefault()
      showTab('windows')
      query.value += e.key
      return
    } else {
      // Tab/Enter/Space stay put, or the segmented controls stop being
      // keyboard-operable.
      return
    }
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
  } else if (e.key === 'Enter') {
    const list = visibleKeys.value
    // With no explicit selection, Enter takes the first match - the usual
    // "type a few letters and hit Enter" flow.
    const row = list.find((r) => r.key === selectedKey.value) ?? list[0]
    if (row) activate(row.appName, row.index)
  } else if (e.key === 'Escape') {
    if (query.value) query.value = ''
    else window.api.hidePopover()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  searchEl.value?.focus()

  window.api.onWindowList((next) => {
    groups.value = next
    error.value = ''
  })
  window.api.onWindowListError((message) => {
    error.value = message
  })
  window.api.onShortcutStatus((status) => {
    shortcut.value = status
  })
})

defineExpose({ showTab, tab, query, groups, selectedKey, editingKey, visibleKeys })
</script>

<template>
  <div class="shell">
    <div class="tabs">
      <button
        class="tab"
        :class="{ active: tab === 'windows' }"
        data-tab="windows"
        @click="showTab('windows')"
      >
        Windows
      </button>
      <button
        class="tab"
        :class="{ active: tab === 'settings' }"
        data-tab="settings"
        @click="showTab('settings')"
      >
        Settings
      </button>
    </div>

    <div v-show="tab === 'windows'" class="search-wrap">
      <input
        ref="searchEl"
        v-model="query"
        type="text"
        placeholder="Filter windows..."
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <WindowsTab
      v-show="tab === 'windows'"
      ref="windowsTab"
      :groups="groups"
      :error="error"
      :query="query"
      :selected-key="selectedKey"
      :editing-key="editingKey"
      @activate="activate"
      @start-edit="(k) => (editingKey = k)"
      @end-edit="editingKey = null"
    />

    <SettingsTab v-show="tab === 'settings'" :shortcut="shortcut" />
  </div>
</template>

<style scoped>
.shell { display: flex; flex-direction: column; height: 100%; }
.tabs {
  display: flex;
  gap: 2px;
  padding: 8px 8px 7px;
  border-bottom: 1px solid var(--line);
  flex: none;
}
.tab {
  flex: 1;
  background: none;
  border: none;
  border-radius: 7px;
  padding: 5px 8px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: background 90ms, color 90ms;
}
.tab:hover { background: var(--hover); }
.tab.active { background: var(--hover); color: var(--fg); }

.search-wrap { padding: 8px 10px 4px; flex: none; }
.search-wrap input {
  width: 100%;
  padding: 6px 9px;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--fg);
  background: var(--field);
  border: 1px solid var(--line);
  border-radius: 7px;
  outline: none;
}
.search-wrap input::placeholder { color: var(--dim); }
.search-wrap input:focus { border-color: var(--accent); }
</style>
