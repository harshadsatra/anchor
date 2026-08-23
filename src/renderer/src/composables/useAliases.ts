import { reactive } from 'vue'

// Keyed on title, not AX index: indices shift as windows open and close, which
// would silently move a rename onto a different window. Cost is that a rename
// detaches when the title changes.
export const aliasKey = (appName: string, title: string): string => `${appName}|||${title}`

function load(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem('aliases') || '{}')
    return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export const aliases = reactive<Record<string, string>>(load())

function persist(): void {
  try {
    localStorage.setItem('aliases', JSON.stringify(aliases))
  } catch {
    /* ignore */
  }
}

/** Empty or unchanged clears the rename. */
export function setAlias(key: string, value: string, original: string): void {
  const v = value.trim()
  if (!v || v === original) delete aliases[key]
  else aliases[key] = v
  persist()
}

export function clearAliases(): void {
  for (const k of Object.keys(aliases)) delete aliases[k]
  persist()
}

export const displayName = (appName: string, title: string): string =>
  aliases[aliasKey(appName, title)] || title
