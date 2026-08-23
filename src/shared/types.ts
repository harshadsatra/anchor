export interface WindowEntry {
  title: string
  /** Real AX window index. Counts untitled windows we skip, so it stays valid. */
  index: number
}

export interface AppGroup {
  appName: string
  windows: WindowEntry[]
  icon: string | null
  /** Timestamp this app was last frontmost; 0 if never seen. */
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
