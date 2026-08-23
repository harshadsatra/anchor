// Runs sandboxed: only 'electron' may be imported. Anything else (a
// require('./package.json'), say) fails to load the preload entirely and
// leaves window.api undefined, which kills the whole popover.
import { contextBridge, ipcRenderer } from 'electron'
import type { AppGroup, AppInfo, ShortcutStatus } from '../shared/types'

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('get-app-info'),
  onWindowList: (cb: (groups: AppGroup[]) => void): void => {
    ipcRenderer.on('window-list', (_e, groups: AppGroup[]) => cb(groups))
  },
  onWindowListError: (cb: (message: string) => void): void => {
    ipcRenderer.on('window-list-error', (_e, message: string) => cb(message))
  },
  onShortcutStatus: (cb: (status: ShortcutStatus) => void): void => {
    ipcRenderer.on('shortcut-status', (_e, status: ShortcutStatus) => cb(status))
  },
  focusWindow: (appName: string, windowIndex: number): void => {
    ipcRenderer.send('focus-window', { appName, windowIndex })
  },
  openExternal: (url: string): void => ipcRenderer.send('open-external', url),
  hidePopover: (): void => ipcRenderer.send('hide-popover'),
  requestRefresh: (): void => ipcRenderer.send('request-refresh'),
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
