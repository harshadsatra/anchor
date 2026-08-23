import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  systemPreferences,
  Tray,
} from 'electron'
import path from 'path'
import { APP_PATHS_SCRIPT, FRONTMOST_SCRIPT, LIST_WINDOWS_SCRIPT, focusWindow, runAppleScript } from './applescript'
import { iconDataURL } from './icons'
import { parseWindowList } from '../shared/lib'
import type { AppGroup } from '../shared/types'
import pkg from '../../package.json'

// A menu-bar app has no console. If stdout/stderr is a dead pipe (launched from
// a terminal that has since closed), Electron's own logging raises EPIPE and
// kills the app. Never let that be fatal.
for (const s of [process.stdout, process.stderr]) s.on('error', () => {})

let tray: Tray | null = null
let popover: BrowserWindow | null = null
let refreshTimer: NodeJS.Timeout | null = null
let frontmostTimer: NodeJS.Timeout | null = null
let lastGroups: AppGroup[] = []
let shortcutOk = false

/** Full enumeration measures ~2.8s, so anything below that just stacks calls. */
const REFRESH_INTERVAL = 8000

// ponytail: 2s frontmost poll is the MRU resolution knob. The query is cheap
// (~0.11s wall, 0.02s CPU); raise this if idle CPU ever matters more than
// recency accuracy.
const FRONTMOST_INTERVAL = 2000

const GLOBAL_SHORTCUT = 'Command+Shift+L'

/** Passing `true` SHOWS the system prompt every time it is called while
 *  untrusted, and this sits on an 8s refresh loop - which nags the user
 *  forever. Prompt once, then poll silently. */
let accessibilityPrompted = false

function hasAccessibility(): boolean {
  const shouldPrompt = !accessibilityPrompted
  accessibilityPrompted = true
  return systemPreferences.isTrustedAccessibilityClient(shouldPrompt)
}

/** appName -> last frontmost timestamp. macOS reports processes in launch
 *  order, never z-order, so recency has to be tracked here. */
const mru = new Map<string, number>()

/** appName -> icon dataURL (null = tried and failed, don't retry). */
const iconCache = new Map<string, string | null>()

async function cacheIconsFor(appNames: string[]): Promise<void> {
  const missing = appNames.filter((n) => !iconCache.has(n))
  if (missing.length === 0) return

  let pathsRaw: string
  try {
    pathsRaw = await runAppleScript(APP_PATHS_SCRIPT)
  } catch {
    return // no icons this round; the list still renders
  }

  const paths = new Map<string, string>()
  for (const line of pathsRaw.split('\n').map((l) => l.trim())) {
    if (!line) continue
    const i = line.indexOf('|||')
    if (i !== -1) paths.set(line.slice(0, i), line.slice(i + 3))
  }

  await Promise.all(
    missing.map(async (name) => {
      const bundle = paths.get(name)
      iconCache.set(name, bundle ? await iconDataURL(bundle) : null)
    }),
  )
}

async function getGroupedWindows(): Promise<AppGroup[]> {
  const raw = await runAppleScript(LIST_WINDOWS_SCRIPT)
  if (!raw) return []

  const groups = parseWindowList(raw)
  await cacheIconsFor([...groups.keys()])

  return [...groups.entries()].map(([appName, windows]) => ({
    appName,
    windows,
    icon: iconCache.get(appName) ?? null,
    lastFrontAt: mru.get(appName) ?? 0,
  }))
}

// --- popover -----------------------------------------------------------------

function createPopover(): void {
  popover = new BrowserWindow({
    width: 340,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js') },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    popover.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    popover.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  popover.on('blur', () => hidePopover())

  // The popover must never navigate away or open child windows.
  popover.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  popover.webContents.on('will-navigate', (e) => e.preventDefault())

  // Without this the popover stays permanently blank after a renderer crash.
  popover.webContents.on('render-process-gone', (_e, details) => {
    console.warn('Popover renderer gone:', details?.reason)
    if (popover && !popover.isDestroyed()) popover.reload()
  })
}

/**
 * Every send routes through here. The render frame can be disposed while a
 * ~3s enumeration is in flight, and an unguarded send throws — including from
 * the catch block in sendWindowList, which is how it once escaped uncaught.
 */
function sendToPopover(channel: string, payload?: unknown): boolean {
  if (!popover || popover.isDestroyed()) return false
  const wc = popover.webContents
  if (!wc || wc.isDestroyed() || wc.isCrashed()) return false
  try {
    wc.send(channel, payload)
    return true
  } catch {
    return false // frame went away mid-flight
  }
}

function positionPopoverUnderTray(): void {
  if (!tray || !popover) return
  const trayBounds = tray.getBounds()
  const { width } = popover.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2)
  const y = Math.round(trayBounds.y + trayBounds.height)
  popover.setPosition(
    Math.min(Math.max(x, display.workArea.x), display.workArea.x + display.workArea.width - width),
    y,
    false,
  )
}

function hidePopover(): void {
  if (popover && !popover.isDestroyed()) popover.hide()
  if (refreshTimer) clearTimeout(refreshTimer)
}

function togglePopover(): void {
  if (!popover) return
  if (popover.isVisible()) {
    hidePopover()
    return
  }
  showPopover()
}

function showPopover(): void {
  if (!popover) return
  if (popover.isVisible()) {
    popover.focus()
    return
  }

  positionPopoverUnderTray()
  popover.show()
  popover.focus()

  // Render what we already have so the popover isn't blank for ~3s.
  if (lastGroups.length) sendToPopover('window-list', lastGroups)
  sendToPopover('shortcut-status', { accelerator: GLOBAL_SHORTCUT, ok: shortcutOk })

  scheduleRefresh(0)
}

// setTimeout chain rather than setInterval: the query can outrun the interval,
// and overlapping osascript calls would pile up.
function scheduleRefresh(delay: number): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    sendWindowList()
      .catch((err) => console.warn('Refresh failed:', err))
      .finally(() => {
        if (popover && !popover.isDestroyed() && popover.isVisible()) {
          scheduleRefresh(REFRESH_INTERVAL)
        }
      })
  }, delay)
}

async function sendWindowList(): Promise<void> {
  // Window enumeration needs Accessibility; without it System Events errors on
  // every process and we'd silently render an empty list.
  if (!hasAccessibility()) {
    sendToPopover(
      'window-list-error',
      'Accessibility permission required. Enable it in System Settings → Privacy & Security → Accessibility, then restart the app.',
    )
    return
  }

  try {
    const groups = await getGroupedWindows()
    lastGroups = groups
    sendToPopover('window-list', groups)
  } catch (err) {
    sendToPopover('window-list-error', String(err))
  }
}

/** Runs whether or not the popover is open — switching apps is exactly what
 *  happens while it's closed. */
function startFrontmostTracking(): void {
  // setTimeout chain, not setInterval: if an osascript call ever blocks (a TCC
  // consent dialog, System Events wedging) setInterval keeps firing and the
  // calls stack up every 2s until the app stops responding.
  const tick = async (): Promise<void> => {
    try {
      const name = await runAppleScript(FRONTMOST_SCRIPT)
      if (name) mru.set(name, Date.now())
    } catch {
      // Permission not granted yet, or a transient System Events hiccup.
    } finally {
      frontmostTimer = setTimeout(tick, FRONTMOST_INTERVAL)
    }
  }
  frontmostTimer = setTimeout(tick, FRONTMOST_INTERVAL)
}

// --- IPC ---------------------------------------------------------------------

ipcMain.handle('get-app-info', () => ({
  name: 'Anchor',
  version: pkg.version, // not app.getVersion(): falls back to Electron's version
  description: pkg.description,
}))

ipcMain.on('focus-window', (_e, { appName, windowIndex }: { appName: string; windowIndex: number }) => {
  mru.set(appName, Date.now()) // clicking is a guaranteed activation
  focusWindow(appName, windowIndex).catch((err) => console.error('Focus failed:', err))
  hidePopover()
})

ipcMain.on('hide-popover', () => hidePopover())
ipcMain.on('request-refresh', () => scheduleRefresh(0))

// Renderer can ask to open a link in the real browser. Validate the scheme
// here: this is a trust boundary, and shell.openExternal will happily hand a
// file:// or custom-scheme URL to the OS.
ipcMain.on('open-external', (_e, url: string) => {
  let parsed: URL
  try {
    parsed = new URL(String(url))
  } catch {
    return
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return
  shell.openExternal(parsed.href)
  hidePopover()
})

// --- lifecycle ---------------------------------------------------------------

// A second launch must not spawn a rival tray icon.
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

// Double-clicking an LSUIElement app that is already running sends a reopen
// event. With nothing handling it, macOS reports "You can't open the
// application because it is not responding" - even though the app is running
// perfectly well in the menu bar. Surface the popover instead.
app.on('activate', () => showPopover())
app.on('second-instance', () => showPopover())

app.whenReady().then(() => {
  app.dock?.hide() // menu-bar-only app, no Dock icon

  // Template image: black + alpha only, so macOS inverts it for dark menu
  // bars and highlight states. Electron picks up @2x alongside it.
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, '../../assets/trayTemplate.png'),
  )
  trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip('Anchor — click to see open windows')
  tray.on('click', togglePopover)

  // right-click only: setContextMenu would hijack left-click on macOS and
  // break the popover toggle.
  tray.on('right-click', () => {
    hidePopover()
    tray?.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Anchor', click: togglePopover },
        { type: 'separator' },
        { label: 'Quit Anchor', click: () => app.quit() },
      ]),
    )
  })

  createPopover()
  startFrontmostTracking()

  shortcutOk = globalShortcut.register(GLOBAL_SHORTCUT, togglePopover)
  if (!shortcutOk) console.warn(`Could not register ${GLOBAL_SHORTCUT} — already taken.`)
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (frontmostTimer) clearTimeout(frontmostTimer)
  if (refreshTimer) clearTimeout(refreshTimer)
})

// Subscribing at all is what keeps a menu-bar app alive with no windows;
// the old e.preventDefault() here was a no-op (the event takes no argument).
app.on('window-all-closed', () => {})
