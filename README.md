# Anchor

A tiny menu-bar widget (no Dock icon) that lists every open window across all
running apps, grouped by app, with icons. Click any entry — or search and hit
Enter — to jump straight to that window.

Built with **Electron + Vue 3 + TypeScript** (electron-vite).

| Windows — dark | Windows — light | Settings |
|:---:|:---:|:---:|
| <img src="screenshots/1.png" alt="Anchor window list in dark mode" width="260"> | <img src="screenshots/2.png" alt="Anchor window list in light mode" width="260"> | <img src="screenshots/3.png" alt="Anchor settings tab" width="260"> |


## Download

Grab the latest `.dmg` from **[Releases](https://github.com/harshadsatra/anchor/releases)**,
open it, and drag Anchor to Applications.

### macOS will say the app is damaged — it isn't

Anchor is **not code-signed** (that needs a paid Apple Developer ID). macOS
quarantines unsigned apps downloaded from the internet and shows
*"Anchor is damaged and can't be opened"*, which is misleading — it means
unsigned, not corrupt. Clear the quarantine flag once:

```bash
xattr -dr com.apple.quarantine /Applications/Anchor.app
```

Then open it normally. Nothing else is needed.

### Grant permissions on first run

Anchor reads window titles across apps and raises the one you pick, which
macOS gates behind two prompts:

1. **Accessibility** — System Settings → Privacy & Security → Accessibility →
   enable **Anchor**.
2. **Automation** — allow Anchor to control **System Events** when asked.

Because the build is only ad-hoc signed, its signature hash changes with every
release, so macOS asks again after an update. A real Developer ID signature
fixes that permanently.

**"You can't open the application Anchor because it is not responding"** — this
appears when you double-click an already-running menu-bar app. Anchor has no
Dock icon and no window, so LaunchServices had nothing to activate and timed
out. Fixed from v1.0.7 on: reopening now surfaces the popover. Also make sure
you're launching the copy in `/Applications`, not one still inside the mounted
`.dmg` — running from the read-only image gives its own set of odd errors.

**If it keeps re-asking and never lists any windows**, check the signature:

```bash
codesign -dv --verbose=2 /Applications/Anchor.app
```

`Identifier` must be `com.harshadsatra.anchor`. If it says `Identifier=Electron`
with `Info.plist=not bound`, the bundle was never signed — macOS TCC keys
Accessibility grants off the code signature, so it can never match the grant
back to the app. Re-sign and reset the stale grant:

```bash
codesign --force --deep --sign - --options runtime \
  --entitlements build/entitlements.mac.plist /Applications/Anchor.app
tccutil reset Accessibility com.harshadsatra.anchor
tccutil reset AppleEvents com.harshadsatra.anchor
```

Then re-enable Anchor in Accessibility. Builds from v1.0.4 on are ad-hoc signed
by electron-builder (`identity: '-'`), so this shouldn't recur.

## Building a release

```bash
npm run dist        # universal .dmg + .zip into release/
npm run dist:dir    # unpacked .app only, for quick testing
npm run icon        # regenerate the app icon from build/icon-source.html
```

Two per-arch `.dmg`s are produced — `Anchor-<version>-arm64.dmg` for Apple
Silicon and `-x64.dmg` for Intel.

### On size

Electron is the entire cost. Measured on a 489MB universal build:

| Component | Size |
|---|---|
| Electron Framework | 484 MB |
| Everything else (frameworks, helpers) | ~4 MB |
| **Anchor's own code** (`app.asar`) | **232 KB** |

Your app is 0.05% of the bundle. What was actually reducible:

- **Per-arch instead of universal** — a universal bundle ships two complete
  Electron frameworks, so every user downloads an architecture they can't run.
  This is the whole win: 489MB → 229MB installed, 208MB → 94MB downloaded.
- **Dropped the `.zip` target** — it exists to feed Squirrel auto-update, which
  this app doesn't use, and it doubled every release upload.
- **`electronLanguages: [en-US]`** — removes 109 `.lproj` dirs. Honest
  accounting: ~1MB. Free, but not the fix.
- **`compression: maximum`** — slower builds, smaller downloads.

**~229MB installed is Electron's floor for one architecture** and no config
gets under it. If that's unacceptable for a menu-bar window lister — a fair
position — the only real answer is not shipping a browser engine. A native
Swift/SwiftUI menu-bar app doing exactly this would be single-digit MB, since
the Accessibility API it would call is the same one being driven through
AppleScript here. That's a rewrite, not a setting.

### Publishing to GitHub Releases

`.github/workflows/release.yml` builds and publishes on a version tag:

```bash
npm version patch      # or minor / major
git push --follow-tags
```

The workflow typechecks, tests, builds, and runs the headless UI check before
publishing — a broken build never reaches a Release. It uses the automatic
`GITHUB_TOKEN`, so no secrets to configure.

> **Why publishing is not left to electron-builder.** Its GitHub publisher
> spawns one publisher per target. With both a `dmg` and a `zip`, the two run
> concurrently, both check "does the release for this tag exist?", both get
> "no", and both POST to `/releases`. One wins; the rest die with
> `422 already_exists` — *after* the release has been created but *before*
> the artifacts upload. The result is a green (or half-failed) workflow and a
> release containing nothing, or only a stray `.blockmap`.
>
> The workflow therefore builds with `--publish never` and uploads once, in a
> single step, via `softprops/action-gh-release` with
> `fail_on_unmatched_files: true` — so a missing `.dmg` fails the run loudly
> instead of publishing an empty release.

`.github/workflows/ci.yml` runs the same checks on every push and PR.

### Signing and notarization (optional)

To remove the quarantine dance for your users you need an Apple Developer ID
($99/yr). With one, add these repo secrets and electron-builder handles the
rest — `electron-builder.yml` already sets `hardenedRuntime` and the Apple
Events entitlement that notarization requires:

| Secret | What it is |
|---|---|
| `CSC_LINK` | base64 of your Developer ID `.p12` |
| `CSC_KEY_PASSWORD` | its password |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password |
| `APPLE_TEAM_ID` | your team id |


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
- **Renames only survive while a window keeps its title** (see above).
