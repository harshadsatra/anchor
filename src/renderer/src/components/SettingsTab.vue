<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AppInfo, ShortcutStatus } from '@shared/types'
import { settings } from '../composables/useSettings'
import { aliases, clearAliases } from '../composables/useAliases'

defineProps<{ shortcut: ShortcutStatus | null }>()

// Empty string hides that link. Opened via shell.openExternal - an <a href>
// would navigate the popover itself.
const DEV = {
  name: 'Harshad Satra',
  // Empty falls back to the package.json description.
  tagline: '',
  website: 'https://harshadsatra.com',
  github: 'https://github.com/harshadsatra',
  linkedin: 'https://linkedin.com/in/harshadsatra',
}

const appInfo = ref<AppInfo | null>(null)
onMounted(async () => {
  try {
    appInfo.value = await window.api.getAppInfo()
  } catch {
    /* ignore */
  }
})

const links = computed(() =>
  [
    { key: 'website', label: 'Website', glyph: '↗', url: DEV.website },
    { key: 'github', label: 'GitHub', glyph: '⚙', url: DEV.github },
    { key: 'linkedin', label: 'LinkedIn', glyph: '■', url: DEV.linkedin },
  ].filter((l) => !!l.url),
)

const infoText = computed(() => DEV.tagline || appInfo.value?.description || '')
const aliasCount = computed(() => Object.keys(aliases).length)

/** window isn't in template scope. */
const openLink = (url: string): void => window.api.openExternal(url)

const prettyAccel = (a: string): string =>
  a.replace('Command', '⌘').replace('Shift', '⇧').replace(/\+/g, '')
</script>

<template>
  <div class="pane">
    <div class="setting">
      <h3>Appearance</h3>
      <div class="segmented">
        <button
          v-for="v in (['auto', 'light', 'dark'] as const)"
          :key="v"
          :class="{ active: settings.theme === v }"
          @click="settings.theme = v"
        >
          {{ v === 'auto' ? 'Auto' : v === 'light' ? 'Light' : 'Dark' }}
        </button>
      </div>
    </div>

    <div class="setting">
      <h3>Sort apps by</h3>
      <div class="segmented">
        <button
          v-for="v in (['recent', 'name', 'count'] as const)"
          :key="v"
          :class="{ active: settings.sort === v }"
          @click="settings.sort = v"
        >
          {{ v === 'recent' ? 'Recent' : v === 'name' ? 'A-Z' : 'Windows' }}
        </button>
      </div>
    </div>

    <div class="setting">
      <h3>App name size</h3>
      <div class="segmented">
        <button
          v-for="v in (['small', 'medium', 'large'] as const)"
          :key="v"
          :class="{ active: settings.appFont === v }"
          @click="settings.appFont = v"
        >
          {{ v === 'small' ? 'Small' : v === 'medium' ? 'Medium' : 'Large' }}
        </button>
      </div>
    </div>

    <div class="setting">
      <h3>Window list size</h3>
      <div class="segmented">
        <button
          v-for="v in (['small', 'medium', 'large'] as const)"
          :key="v"
          :class="{ active: settings.listFont === v }"
          @click="settings.listFont = v"
        >
          {{ v === 'small' ? 'Small' : v === 'medium' ? 'Medium' : 'Large' }}
        </button>
      </div>
    </div>

    <div class="setting">
      <h3>Renamed windows</h3>
      <p class="sub">
        {{
          aliasCount === 0
            ? 'No windows renamed yet. Hover a window and click the pencil to rename it.'
            : `${aliasCount} ${aliasCount === 1 ? 'window' : 'windows'} renamed.`
        }}
      </p>
      <button v-if="aliasCount" class="link-btn" @click="clearAliases()">Clear all renames</button>
    </div>

    <div class="setting">
      <h3>About</h3>
      <div id="about">
        <span class="dev-name">{{ DEV.name }}</span>
        <div class="dev-info">
          {{ infoText }}
          <br v-if="appInfo?.version" />
          <span v-if="appInfo?.version" class="dev-meta">Anchor v{{ appInfo.version }}</span>
        </div>
        <div class="dev-links">
          <button
            v-for="l in links"
            :key="l.key"
            class="dev-link"
            :title="l.url"
            @click="openLink(l.url)"
          >
            <span class="glyph">{{ l.glyph }}</span>{{ l.label }}
          </button>
          <span v-if="!links.length" class="sub">No links configured yet.</span>
        </div>
      </div>
    </div>

    <div v-if="shortcut" class="hint">
      <template v-if="shortcut.ok">
        <kbd>{{ prettyAccel(shortcut.accelerator) }}</kbd>
        toggles this popover.<br />Arrows move, Enter focuses, Esc closes.<br />Hover a window and
        click the pencil to rename it.
      </template>
      <template v-else>
        <kbd>{{ shortcut.accelerator }}</kbd> could not be registered - another app is using it.
      </template>
    </div>
  </div>
</template>

<style scoped>
.pane { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 0 8px; }
.setting { padding: 12px 14px 4px; }
.setting h3 {
  margin: 0 0 7px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--dim);
}
.segmented { display: flex; gap: 4px; }
.segmented button {
  flex: 1;
  padding: 6px 4px;
  font-size: 12px;
  color: var(--muted);
  background: var(--field);
  border: 1px solid var(--line);
  border-radius: 7px;
  cursor: pointer;
  transition: background 90ms, color 90ms;
}
.segmented button:hover { background: var(--hover); }
.segmented button.active { background: var(--accent); border-color: var(--accent); color: #fff; }

.sub { margin: 7px 0 0; font-size: 11px; color: var(--dim); line-height: 1.45; }
.link-btn {
  background: none; border: none; padding: 0; margin-top: 6px;
  color: var(--accent); font-size: 11px; cursor: pointer; text-decoration: underline;
}

#about { display: flex; flex-direction: column; gap: 9px; }
.dev-name { font-size: 12.5px; font-weight: 600; color: var(--fg); }
.dev-info { font-size: 11px; line-height: 1.5; color: var(--muted); margin: -3px 0 1px; }
.dev-meta {
  display: inline-block;
  margin-top: 4px;
  font-size: 10px;
  color: var(--dim);
  background: var(--badge);
  border-radius: 5px;
  padding: 1px 6px;
}
.dev-links { display: flex; flex-wrap: wrap; gap: 5px; }
.dev-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  font-size: 11.5px;
  color: var(--muted);
  background: var(--field);
  border: 1px solid var(--line);
  border-radius: 7px;
  cursor: pointer;
  transition: background 90ms, color 90ms, border-color 90ms;
}
.dev-link:hover { background: var(--hover); color: var(--fg); border-color: var(--accent); }
.dev-link .glyph { font-size: 12px; opacity: 0.85; }

.hint {
  padding: 10px 14px 14px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--muted);
  border-top: 1px solid var(--line);
  margin-top: 14px;
}
.hint kbd {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  background: var(--badge);
  border-radius: 4px;
  padding: 1px 5px;
}
</style>
