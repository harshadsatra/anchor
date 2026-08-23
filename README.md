# Anchor

A tiny menu-bar widget (no Dock icon) that lists every open window across all
running apps, grouped by app, with icons. Click any entry — or search and hit
Enter — to jump straight to that window.

Built with **Electron + Vue 3 + TypeScript** (electron-vite).

## Setup

```bash
npm install
npm run dev      # hot-reloading dev build
npm run build    # production build into out/
npm start        # preview the built app
```

Checks:

- `npm test` — Vitest over the shared parsing/sorting logic.
- `npm run typecheck` — vue-tsc across main, preload, renderer.
- `npm run check` — runs the window-enumeration AppleScript against the live
  system and prints the window/app count.
- `npm run verify:ui` — headless check of the **built** output: loads
  `out/renderer` with `out/preload` and drives the real IPC path, so it covers
  preload → contextBridge → Vue exactly as the app does.

## Layout

```
src/
  main/        Electron main — AppleScript, icons, tray, IPC
    applescript.ts   window enumeration, frontmost poll, focus-by-AX-index
    icons.ts         NSWorkspace icon extraction via JXA
    index.ts         app lifecycle, popover, MRU tracking
  preload/     contextBridge surface (sandboxed — only 'electron' importable)
  shared/      pure logic + types, used by main AND renderer
  renderer/    Vue 3 SFCs
```

`src/shared/lib.ts` is imported by both the main process and the renderer, so
both sort identically and one test covers both.

## Required permission (do this first)

This app lists and activates *other apps'* windows, which macOS only allows
through the Accessibility API.

1. On first open the app checks Accessibility itself and shows the system
   prompt; the popover says what's missing instead of rendering empty.
2. **System Settings → Privacy & Security → Accessibility** — enable
   **Electron** (in dev, permission attaches to the Electron binary, not your
   project).
3. Also check **Automation** and allow "System Events" when prompted.
4. Restart after granting — TCC doesn't apply retroactively.

## Using it

- **`Cmd+Shift+L`** toggles the popover, or click the tray icon. If another app
  owns that combo, Settings says so.
- **Right-click the tray icon** for Open / Quit.
- **Type to filter** — matches app names, window titles, and renames.
- **Arrows** move, **Enter** focuses (first match if nothing selected),
  **Esc** clears the filter or closes.

### Settings

- **Appearance** — Auto / Light / Dark (Auto follows macOS).
- **Sort apps by** — Recent / A–Z / Windows.
- **App name size** / **Window list size** — Small / Medium / Large,
  independent.
- **Renamed windows** — count, and a clear-all.

All persist in `localStorage`.

### Renaming windows

Hover a window, click the pencil. Enter commits, Escape cancels, empty restores
the original.

**Caveat:** a rename is keyed to the app plus the window's *exact* title,
because macOS exposes no stable per-window id. A window whose title changes (a
Chrome tab switch) drops its custom name. Keying on AX index would be worse —
indices shift as windows open and close, silently moving a rename onto a
different window.

## Things that look like bugs but aren't

### Icons don't use `app.getFileIcon()`

That API returns the **same generic placeholder for every .app bundle** on
macOS — byte-identical dataURLs across four different apps, which is why icons
first shipped as grey squares. `nativeImage.createFromPath()` on the bundle's
`.icns` doesn't work either (decodes to 0x0), and
`getFileIcon(p, { size: 'large' })` hard-crashes Electron 43 with SIGTRAP.

`NSWorkspace.iconForFile` — what Finder uses — works and covers modern apps
shipping an asset catalog instead of an `.icns`. Reached via
`osascript -l JavaScript`, downscaled by `nativeImage` to 32px (~3KB each).
`verify:ui` asserts icons are **distinct per app**, which is the check that
catches a regression back to the placeholder.

### The preload is built as CommonJS

`sandbox: true` renderers **cannot load an ESM preload**. Building it as ESM
makes the preload fail outright, leaving `window.api` undefined and the whole
popover dead. This is also why `package.json` has no `"type": "module"` — main
needs `__dirname` too. `verify:ui` asserts the built preload is CJS.

### "Recently used" is tracked, not queried

macOS does **not** expose window z-order — `every process` returns stable launch
order regardless of what's in front. So a cheap 2s poll records the frontmost
app, and clicking an entry bumps it immediately. The poll runs even when the
popover is closed, since that's when app switching happens.

### The 8s refresh

Measured — System Events round-trips dominate, so a "smarter" script doesn't
help:

| Call | Wall time | CPU |
|---|---|---|
| Full window enumeration | 2.77s | 0.03s |
| Same + bundle paths | 4.02s | 0.04s |
| Frontmost app only | 0.11s | 0.02s |

At 4s a 2.8s query meant a ~70% duty cycle, and `setInterval` doesn't wait for
the previous call, so slow polls stacked. Refresh is a self-scheduling
`setTimeout` chain at 8s. The popover also renders the last known list
immediately on open, so it's never blank for three seconds.

## Known limitations

- **Untitled windows are skipped** (menu extras, background helpers). Their AX
  indices are still counted, so listed windows keep the right index.
- **Enumeration is inherently slow** (~2.8s) because every System Events
  property access is an Apple Event. A native Swift/ObjC Accessibility helper
  would be far faster, at the cost of a compiled dependency.
- **MRU only covers this session** — recency is in memory and resets on quit.
- **Nothing enforces a single instance** — launching twice gives two tray
  icons. `app.requestSingleInstanceLock()` would fix it.
