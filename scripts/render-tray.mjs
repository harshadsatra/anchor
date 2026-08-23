// Regenerates the menu-bar template icon from build/tray-source.html:
//   npm run icon:tray
// Emits assets/trayTemplate.png (22px) and @2x (44px). Template images must be
// black + alpha only; macOS inverts them for dark menu bars and highlights.
import { app, BrowserWindow, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 352, height: 352, show: false, frame: false, transparent: true })
  await win.loadFile(path.join(DIR, 'build/tray-source.html'))
  await new Promise((r) => setTimeout(r, 400))
  const shot = await win.capturePage()

  for (const [name, px] of [['trayTemplate.png', 22], ['trayTemplate@2x.png', 44]]) {
    const out = shot.resize({ width: px, height: px, quality: 'best' })
    fs.writeFileSync(path.join(DIR, 'assets', name), out.toPNG())
    console.log('wrote assets/' + name, out.getSize())
  }
  app.exit(0)
})
