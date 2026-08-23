/**
 * macOS app-icon extraction.
 *
 * app.getFileIcon() is a dead end here: on macOS it returns the SAME generic
 * placeholder for every .app bundle (verified — byte-identical dataURLs across
 * four different apps). nativeImage can't decode .icns either (returns 0x0).
 * NSWorkspace.iconForFile is what Finder itself uses and covers modern apps
 * shipping an asset catalog instead of an .icns, so shell out to JXA for a PNG
 * and let nativeImage do the downscale.
 *
 * Also: app.getFileIcon(p, { size: 'large' }) hard-crashes Electron 43 with
 * SIGTRAP. Don't reach for it as a "fix".
 */
import { execFile } from 'child_process'
import { nativeImage } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ICON_PX = 32 // 2x the 17px render size, for retina

function runJxa(bundlePath: string, outPath: string): Promise<void> {
  const src = `ObjC.import('AppKit');
var img = $.NSWorkspace.sharedWorkspace.iconForFile(${JSON.stringify(bundlePath)});
var rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
var png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
png.writeToFileAtomically(${JSON.stringify(outPath)}, true);`
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', src], (err) =>
      err ? reject(err) : resolve(),
    )
  })
}

/** Data URL for the bundle's icon, or null if it can't be read. */
export async function iconDataURL(bundlePath: string): Promise<string | null> {
  const tmp = path.join(os.tmpdir(), `al-${crypto.randomBytes(6).toString('hex')}.png`)
  try {
    await runJxa(bundlePath, tmp)
    const img = nativeImage.createFromPath(tmp).resize({ width: ICON_PX, height: ICON_PX })
    return img.isEmpty() ? null : img.toDataURL()
  } catch {
    return null // one unreadable icon must not blank the list
  } finally {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      /* ignore */
    }
  }
}
