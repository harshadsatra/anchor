# Contributing to Anchor

Contributions are welcome — bug reports, fixes, and features all help.

Anchor is a macOS menu-bar app that lists every open window across running
apps and jumps to the one you pick. It's Electron + Vue 3 + TypeScript, built
with electron-vite. See the [README](README.md) for what it does and how it
works.

## Getting set up

```bash
git clone https://github.com/<your-username>/anchor.git
cd anchor
npm install
npm run dev        # hot-reloading dev build
```

You'll need macOS (the whole app is built on macOS-only APIs) and Node 22.

Grant **Accessibility** to whatever runs your terminal — Terminal, iTerm, VS
Code — or every AppleScript call returns empty. macOS attributes the
permission to the *launching* app, not to `osascript`.

## Before opening a PR

Run all four. CI runs exactly these, so a green local run means a green PR:

```bash
npm run typecheck   # vue-tsc across main, preload, renderer
npm test            # Vitest over src/shared
npm run verify:ui   # headless check of the BUILT output
npm run check       # AppleScript liveness (needs Accessibility, see above)
```

`npm run verify:ui` builds nothing itself — run `npm run build` first if you've
changed source.

## Sending the PR

1. Fork, then branch off `main` (`git checkout -b fix-window-ordering`).
2. Keep it focused. One concern per PR reviews far faster.
3. Explain **why**, not just what. If it fixes a bug, say how to reproduce it.
4. Add a check for anything non-trivial — a Vitest case for logic in
   `src/shared`, or an assertion in `scripts/verify-ui.mjs` for UI and main
   behaviour.
5. Flag anything CI cannot cover. Permissions, the tray menu, window focusing
   and packaging all need a human on a real Mac — say what you tested by hand.

## Traps worth knowing before you start

These have each already caused a real bug here, and none are obvious:

- **The preload is sandboxed.** Only `electron` can be imported. A
  `require('./package.json')` in `src/preload` fails to load the preload
  entirely, leaving `window.api` undefined and the whole popover dead. Pass
  data through IPC instead.
- **The preload must build as CommonJS.** Sandboxed renderers cannot load an
  ESM preload. This is also why `package.json` has no `"type": "module"`.
- **Don't reach for `app.getFileIcon()`.** On macOS it returns the same generic
  placeholder for every `.app`. Icons go through `NSWorkspace.iconForFile` in
  `src/main/icons.ts`. And `size: 'large'` hard-crashes Electron 43 with
  SIGTRAP.
- **Shared logic lives in `src/shared`,** imported by both the main process and
  the renderer, so both sort identically and one test covers both. Don't
  duplicate it into a component.
- **Window enumeration takes ~2.8s.** Anything polling it must be a
  self-scheduling `setTimeout` chain, never `setInterval` — otherwise slow
  calls stack until the app stops responding.
- **`electron-builder.yml` and the release workflow's file globs must stay in
  step.** A stale glob fails the release, by design.

## Reporting a bug

Include your macOS version, the Anchor version (Settings → About), and whether
you installed from a release `.dmg` or ran from source. For anything involving
permissions, paste the output of:

```bash
codesign -dv --verbose=2 /Applications/Anchor.app
```
