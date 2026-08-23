import { reactive, watchEffect } from 'vue'
import type { FontSize, SortMode, ThemeMode } from '@shared/types'

const FONT_PX: Record<FontSize, string> = {
  small: '11px',
  medium: '12.5px',
  large: '14.5px',
}

function load<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

export interface Settings {
  theme: ThemeMode
  sort: SortMode
  appFont: FontSize
  listFont: FontSize
}

const FONTS = ['small', 'medium', 'large'] as const

export const settings = reactive<Settings>({
  theme: load('theme', 'auto', ['auto', 'light', 'dark'] as const),
  sort: load('sort', 'recent', ['recent', 'name', 'count'] as const),
  appFont: load('appFont', 'medium', FONTS),
  listFont: load('listFont', 'medium', FONTS),
})

/** Auto removes the attribute so prefers-color-scheme takes over. */
export function useSettingsEffects(): void {
  watchEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
    root.style.setProperty('--app-font', FONT_PX[settings.appFont])
    root.style.setProperty('--list-font', FONT_PX[settings.listFont])

    try {
      localStorage.setItem('theme', settings.theme)
      localStorage.setItem('sort', settings.sort)
      localStorage.setItem('appFont', settings.appFont)
      localStorage.setItem('listFont', settings.listFont)
    } catch {
      /* blocked storage */
    }
  })
}
