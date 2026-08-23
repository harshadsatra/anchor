<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { WindowEntry } from '@shared/types'
import { aliasKey, aliases, setAlias } from '../composables/useAliases'

const props = defineProps<{
  appName: string
  win: WindowEntry
  selected: boolean
  editing: boolean
}>()

const emit = defineEmits<{
  activate: []
  startEdit: []
  endEdit: []
}>()

const key = () => aliasKey(props.appName, props.win.title)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

watch(
  () => props.editing,
  async (on) => {
    if (!on) return
    draft.value = aliases[key()] || props.win.title
    await nextTick()
    inputEl.value?.focus()
    inputEl.value?.select()
  },
  { immediate: true },
)

function commit(): void {
  if (!props.editing) return
  setAlias(key(), draft.value, props.win.title)
  emit('endEdit')
}
</script>

<template>
  <div class="window-row" :class="{ selected }">
    <input
      v-if="editing"
      ref="inputEl"
      v-model="draft"
      class="rename-input"
      spellcheck="false"
      @keydown.stop.enter="commit"
      @keydown.stop.esc="emit('endEdit')"
      @blur="commit"
    />
    <template v-else>
      <button
        class="window-item"
        :class="{ renamed: !!aliases[key()] }"
        :title="aliases[key()] ? `${aliases[key()]}\n(original: ${win.title})` : win.title"
        @click="emit('activate')"
      >
        {{ aliases[key()] || win.title }}
      </button>
      <button class="rename-btn" title="Rename this window" @click.stop="emit('startEdit')">
        ✎
      </button>
    </template>
  </div>
</template>

<style scoped>
.window-row {
  display: flex;
  align-items: center;
  margin: 1px 7px;
  border-radius: 7px;
}
.window-row:hover,
.window-row.selected { background: var(--hover); }

.window-item {
  flex: 1;
  min-width: 0;
  padding: 6px 4px 6px 30px;
  background: none;
  border: none;
  border-radius: 7px;
  color: var(--muted);
  text-align: left;
  font-size: var(--list-font);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.window-row:hover .window-item,
.window-row.selected .window-item { color: var(--fg); }
.window-item.renamed { font-style: italic; }

.rename-btn {
  flex: none;
  width: 24px;
  height: 22px;
  margin-right: 4px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--dim);
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 90ms;
}
.window-row:hover .rename-btn { opacity: 1; }
.rename-btn:hover { background: var(--badge); color: var(--fg); }

.rename-input {
  flex: 1;
  min-width: 0;
  margin: 2px 6px 2px 28px;
  padding: 4px 7px;
  font-family: inherit;
  font-size: var(--list-font);
  color: var(--fg);
  background: var(--field);
  border: 1px solid var(--accent);
  border-radius: 6px;
  outline: none;
}
</style>
