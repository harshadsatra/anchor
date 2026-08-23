import type { AppGroup, SortMode, WindowEntry } from './types'

/** "AppName|||Index|||Window Title" -> Map(appName -> entries) */
export function parseWindowList(raw: string): Map<string, WindowEntry[]> {
  const groups = new Map<string, WindowEntry[]>()
  if (!raw) return groups

  for (const line of raw.split('\n').map((l) => l.trim())) {
    if (!line) continue
    const parts = line.split('|||')
    if (parts.length < 3) continue

    const [appName, index, ...rest] = parts
    if (!appName) continue

    const idx = Number(index)
    if (!Number.isInteger(idx) || idx < 1) continue

    // Rejoin: a window title is allowed to contain "|||" itself.
    const title = rest.join('|||')
    const list = groups.get(appName)
    if (list) list.push({ title, index: idx })
    else groups.set(appName, [{ title, index: idx }])
  }

  return groups
}

/** Never mutates the input array. */
export function sortGroups(list: readonly AppGroup[], mode: SortMode): AppGroup[] {
  const copy = [...list]

  if (mode === 'name') {
    return copy.sort((a, b) => a.appName.localeCompare(b.appName))
  }
  if (mode === 'count') {
    return copy.sort(
      (a, b) => b.windows.length - a.windows.length || a.appName.localeCompare(b.appName),
    )
  }
  // recent: most-recently-frontmost first, then apps never seen front, A-Z
  return copy.sort((a, b) => {
    const av = a.lastFrontAt || 0
    const bv = b.lastFrontAt || 0
    if (av && bv) return bv - av
    if (av) return -1
    if (bv) return 1
    return a.appName.localeCompare(b.appName)
  })
}
