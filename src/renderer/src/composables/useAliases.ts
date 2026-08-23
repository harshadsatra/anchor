import { reactive } from 'vue'

/**
 * Renames are keyed on app + original title. Window titles are volatile, so a
 * rename sticks to whatever window carries that exact title and detaches once
 * the title changes (a Chrome tab switch, say). Keying on AX index instead
 * would be worse: indices shift as windows open and close, silently moving a
 * rename onto a different window.
 */
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

/** Empty (or unchanged) value clears the rename rather than storing a no-op. */
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
