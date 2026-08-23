// Regenerates build/icon.png (1024px) from build/icon-source.html, then the
// .icns via macOS's own sips + iconutil:
//   node scripts/render-icon.mjs && npm run icon:icns
import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
  })
  await win.loadFile(path.join(DIR, 'build/icon-source.html'))
  await new Promise((r) => setTimeout(r, 600)) // let gradients settle
  const img = await win.capturePage()
  fs.writeFileSync(path.join(DIR, 'build/icon.png'), img.toPNG())
  console.log('wrote build/icon.png', img.getSize())
  app.exit(0)
})
