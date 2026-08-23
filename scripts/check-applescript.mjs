// Verifies the window-enumeration AppleScript still works against the live
// system and returns the "AppName|||Index|||Title" shape the parser expects.
import { execFile } from 'child_process'
import { readFileSync } from 'fs'

const src = readFileSync(new URL('../src/main/applescript.ts', import.meta.url), 'utf8')
const m = src.match(/export const LIST_WINDOWS_SCRIPT = `([^`]*)`/)
if (!m) {
  console.error('FAIL: could not find LIST_WINDOWS_SCRIPT in src/main/applescript.ts')
  process.exit(1)
}

execFile('osascript', ['-e', m[1]], { maxBuffer: 1 << 20 }, (err, stdout) => {
  if (err) {
    console.error('FAIL:', String(err).trim())
    process.exit(1)
  }
  const lines = stdout.trim().split('\n').filter(Boolean)
  if (!lines.length) {
    console.error(
      'FAIL: empty output — grant Accessibility to the app hosting this shell ' +
        '(Terminal/iTerm/VS Code); TCC blames the launching app, not osascript',
    )
    process.exit(1)
  }
  if (!lines.every((l) => l.split('|||').length >= 3)) {
    console.error('FAIL: unparseable:', stdout.slice(0, 200))
    process.exit(1)
  }
  const apps = new Set(lines.map((l) => l.split('|||')[0]))
  console.log('OK', lines.length, 'windows,', apps.size, 'apps')
})
