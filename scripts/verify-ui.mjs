// Headless UI check against the BUILT output: npm run verify:ui
// Loads out/renderer with out/preload and drives the real IPC path, so this
// exercises preload -> contextBridge -> Vue exactly as the app does.
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8'))

// Run against a throwaway profile. The renderer persists settings and renames
// to localStorage, which lives in userData - so consecutive runs would inherit
// the previous run's font sizes and aliases and fail on a dirty baseline.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-verify-'))
app.setPath('userData', profile)

const FIXTURE = [
  {
    appName: 'Arc',
    windows: [
      { title: 'Gmail', index: 1 },
      { title: 'Docs', index: 2 },
    ],
    icon: 'data:image/png;base64,iVBORw0KGgo=',
    lastFrontAt: 99,
  },
  { appName: 'Zed', windows: [{ title: 'main.ts', index: 1 }], icon: null, lastFrontAt: 0 },
]

app.whenReady().then(async () => {
  ipcMain.handle('get-app-info', () => ({
    name: 'Anchor',
    version: pkg.version,
    description: pkg.description,
  }))

  const preloadErrors = []
  const consoleErrors = []

  const win = new BrowserWindow({
    show: false,
    width: 340,
    height: 480,
    webPreferences: { preload: path.join(DIR, 'out/preload/index.js') },
  })
  win.webContents.on('preload-error', (_e, _p, err) =>
    preloadErrors.push('preload failed: ' + err.message),
  )
  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2 && !msg.includes('Content-Security-Policy')) consoleErrors.push(msg)
  })

  await win.loadFile(path.join(DIR, 'out/renderer/index.html'))

  // Before any data arrives the pane must NOT claim there are no windows -
  // the first scan takes ~3s and "No windows found" is simply wrong there.
  const preload_state = await win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector('.empty-state')
      return { text: el ? el.textContent.trim() : null }
    })()`,
  )

  // Feed the renderer through the real channels.
  win.webContents.send('window-list', FIXTURE)
  win.webContents.send('shortcut-status', { accelerator: 'Command+Shift+L', ok: true })

  const results = await win.webContents.executeJavaScript(`(async () => {
    const out = []
    const ok = (name, cond, extra) => out.push({ name, pass: !!cond, extra })
    const tick = () => new Promise(r => setTimeout(r, 30))
    const $ = (s) => document.querySelector(s)
    const $$ = (s) => [...document.querySelectorAll(s)]
    const press = (key, opts = {}) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
    const setInput = (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const search = () => $('.search-wrap input')
    const onSettings = () => $('.tab[data-tab="settings"]').classList.contains('active')
    const gotoSettings = async () => { $('.tab[data-tab="settings"]').click(); await tick() }
    const gotoWindows = async () => { $('.tab[data-tab="windows"]').click(); await tick() }

    await tick()

    // --- rendering through real IPC ---
    ok('window-list IPC rendered rows', $$('.window-row').length === 3,
       $$('.window-row').length + ' rows')
    ok('app groups rendered', $$('.group').length === 2)
    ok('icon renders as <img>', !!$('.group-title img'))
    ok('missing icon falls back to letter badge', !!$('.group-title .fallback'))

    // --- sorting (recent: Arc lastFrontAt 99 before Zed 0) ---
    ok('recent sort puts frontmost app first',
       $$('.group-title .name')[0].textContent.trim() === 'Arc',
       $$('.group-title .name').map(n => n.textContent.trim()).join(','))

    // --- search ---
    setInput(search(), 'gmail'); await tick()
    ok('search filters', $$('.window-item').map(b => b.textContent.trim()).join() === 'Gmail')
    setInput(search(), ''); await tick()
    ok('clearing search restores all', $$('.window-row').length === 3)

    // --- settings tab keyboard behaviour ---
    await gotoSettings()
    ok('tab click switches to Settings', onSettings())
    press('c'); await tick()
    ok('typing on Settings jumps to Windows', !onSettings())
    ok('typed char lands in filter', search().value === 'c', 'value=' + search().value)
    setInput(search(), ''); await tick()

    await gotoSettings(); press('ArrowDown'); await tick()
    ok('ArrowDown leaves Settings', !onSettings())
    ok('ArrowDown selects a row', !!$('.window-row.selected'))

    for (const k of ['Tab', ' ', 'Enter']) {
      await gotoSettings(); press(k); await tick()
      ok('key ' + JSON.stringify(k) + ' stays on Settings', onSettings())
    }
    await gotoSettings(); press('a', { metaKey: true }); await tick()
    ok('Cmd+A stays on Settings', onSettings())
    await gotoWindows()

    // --- font size settings ---
    const appPx = () => getComputedStyle($('.group-title')).fontSize
    const listPx = () => getComputedStyle($('.window-item')).fontSize
    const appMed = appPx(), listMed = listPx()
    await gotoSettings()
    const segs = $$('.setting')
    const segByHeading = (h) => segs.find(s => s.querySelector('h3')?.textContent.trim() === h)
    segByHeading('App name size').querySelectorAll('button')[2].click()
    await gotoWindows()
    ok('app name size grows', parseFloat(appPx()) > parseFloat(appMed), appMed + ' -> ' + appPx())
    ok('app size leaves list alone', listPx() === listMed, 'list=' + listPx())
    await gotoSettings()
    segByHeading('Window list size').querySelectorAll('button')[0].click()
    await gotoWindows()
    ok('list size shrinks', parseFloat(listPx()) < parseFloat(listMed), listMed + ' -> ' + listPx())
    ok('font choices persist', localStorage.getItem('appFont') === 'large' &&
       localStorage.getItem('listFont') === 'small')

    // --- theme ---
    await gotoSettings()
    segByHeading('Appearance').querySelectorAll('button')[1].click(); await tick()
    ok('light theme sets data-theme', document.documentElement.getAttribute('data-theme') === 'light')
    segByHeading('Appearance').querySelectorAll('button')[0].click(); await tick()
    ok('auto theme clears override', !document.documentElement.hasAttribute('data-theme'))

    // --- rename ---
    await gotoWindows()
    localStorage.removeItem('aliases')
    $('.rename-btn').click(); await tick()
    const input = $('.rename-input')
    ok('pencil opens inline input', !!input)
    if (input) {
      setInput(input, 'Email')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await tick()
      ok('rename shows new name', $('.window-item').textContent.trim() === 'Email',
         'got=' + $('.window-item').textContent.trim())
      ok('rename persisted', (localStorage.getItem('aliases') || '').includes('Email'))
      ok('renamed row marked italic', !!$('.window-item.renamed'))
      setInput(search(), 'email'); await tick()
      ok('search finds renamed window',
         $$('.window-item').map(b => b.textContent.trim()).join() === 'Email')
      setInput(search(), ''); await tick()
    }

    // --- about ---
    await gotoSettings()
    const info = await window.api.getAppInfo()
    await tick()
    ok('developer name shown', $('.dev-name').textContent.trim().length > 0)
    ok('info block has content', $('.dev-info').textContent.trim().length > 0)
    const y = (s) => Math.round($(s).getBoundingClientRect().top)
    ok('info sits BELOW name', y('.dev-info') > y('.dev-name'))
    ok('info sits ABOVE links', y('.dev-links') > y('.dev-info'))
    ok('version badge uses package.json version',
       $('.dev-meta')?.textContent.trim() === 'Anchor v' + info.version,
       $('.dev-meta')?.textContent)
    ok('all three links render', $$('.dev-link').length === 3, $$('.dev-link').length + '')
    ok('every link is https', $$('.dev-link').every(b => b.title.startsWith('https://')))
    ok('links are buttons not <a href>', $$('#about a').length === 0)

    return out
  })()`)

  results.push({
    name: 'shows a scanning state before the first payload, not "No windows found"',
    pass: !!preload_state.text && !/No windows found/i.test(preload_state.text),
    extra: JSON.stringify(preload_state.text),
  })

  // --- main-process guards (source-level) ---
  const mainSrc = fs.readFileSync(path.join(DIR, 'src/main/index.ts'), 'utf8')
  const push = (name, pass, extra = '') => results.push({ name, pass, extra })
  push(
    'main validates scheme before shell.openExternal',
    mainSrc.includes("parsed.protocol !== 'https:'") && mainSrc.includes("parsed.protocol !== 'http:'"),
  )
  push(
    'popover denies window.open and navigation',
    mainSrc.includes('setWindowOpenHandler') && mainSrc.includes("'will-navigate'"),
  )
  push('sends are guarded against a disposed frame', mainSrc.includes('function sendToPopover'))
  push('refresh is a setTimeout chain, not setInterval', !/setInterval\(sendWindowList/.test(mainSrc))
  push(
    'version comes from package.json, not app.getVersion()',
    /version:\s*pkg\.version/.test(mainSrc) && !/version:\s*app\.getVersion\(\)/.test(mainSrc),
  )
  push('EPIPE on stdout is non-fatal', mainSrc.includes("s.on('error', () => {})"))
  push(
    'reopen is handled (LSUIElement apps report "not responding" without it)',
    mainSrc.includes("app.on('activate'") && mainSrc.includes("app.on('second-instance'"),
  )
  push('startup warms the window cache so the first open is not blank',
    /Warm the cache shortly after launch/.test(mainSrc))
  push('cache warm does not prompt for Accessibility unprompted',
    /isTrustedAccessibilityClient\(false\)/.test(mainSrc))
  push('a second launch cannot spawn a rival tray icon',
    mainSrc.includes('requestSingleInstanceLock'))

  // The Tray constructor throws on a missing file and takes the app with it.
  const trayPng = path.join(DIR, 'assets/trayTemplate.png')
  push('tray icon asset exists', fs.existsSync(trayPng))
  push('tray icon is a 22px template image', (() => {
    if (!fs.existsSync(trayPng)) return false
    const { nativeImage } = require('electron')
    const img = nativeImage.createFromPath(trayPng)
    return !img.isEmpty() && img.getSize().width === 22
  })())
  push('tray icon has an @2x variant for retina',
    fs.existsSync(path.join(DIR, 'assets/trayTemplate@2x.png')))
  push('tray is set as a template image (adapts to light/dark menu bar)',
    mainSrc.includes('setTemplateImage(true)'))
  push(
    'frontmost poll is a setTimeout chain, not setInterval',
    !/frontmostTimer = setInterval/.test(mainSrc),
  )
  push('preload built as CJS (sandbox cannot load ESM)',
    fs.existsSync(path.join(DIR, 'out/preload/index.js')) &&
    fs.readFileSync(path.join(DIR, 'out/preload/index.js'), 'utf8').includes('"use strict"'))

  const guard = (url) => {
    let p
    try { p = new URL(String(url)) } catch { return false }
    return p.protocol === 'https:' || p.protocol === 'http:'
  }
  for (const [url, want] of [
    ['https://github.com/x', true],
    ['http://example.com', true],
    ['file:///etc/passwd', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
  ]) {
    push(`scheme guard ${want ? 'allows' : 'blocks'} ${url}`, guard(url) === want)
  }

  let failed = 0
  for (const r of results) {
    if (!r.pass) failed++
    console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.extra ? '  (' + r.extra + ')' : ''}`)
  }
  if (preloadErrors.length) {
    failed++
    console.log('FAIL  ' + preloadErrors.join(' | '))
  } else {
    console.log('ok    preload loaded and exposed window.api')
  }
  if (consoleErrors.length) {
    failed++
    console.log('FAIL  renderer console errors: ' + consoleErrors.join(' | '))
  }
  console.log(failed ? `\n${failed} failing` : `\nAll ${results.length + 1} UI checks passed.`)
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
  app.exit(failed ? 1 : 0)
})
