export interface WindowEntry {
  title: string
  /** Real AX index: counts the untitled windows we skip. */
  index: number
}

export interface AppGroup {
  appName: string
  windows: WindowEntry[]
  icon: string | null
  /** 0 if never seen frontmost. */
  lastFrontAt: number
}

export type SortMode = 'recent' | 'name' | 'count'
export type ThemeMode = 'auto' | 'light' | 'dark'
export type FontSize = 'small' | 'medium' | 'large'

export interface AppInfo {
  name: string
  version: string
  description: string
}

export interface ShortcutStatus {
  accelerator: string
  ok: boolean
}
