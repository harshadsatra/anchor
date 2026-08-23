import { execFile } from 'child_process'

/**
 * "AppName|||Index|||Title" per titled window. Index counts the untitled
 * windows we skip, so it stays a valid AX index.
 */
export const LIST_WINDOWS_SCRIPT = `
tell application "System Events"
  set output to {}
  set procList to every process whose background only is false
  repeat with proc in procList
    set procName to name of proc
    try
      set winList to every window of proc
      set idx to 0
      repeat with w in winList
        set idx to idx + 1
        set winName to ""
        try
          set winName to name of w
        end try
        if winName is not "" then
          set end of output to (procName & "|||" & idx & "|||" & winName)
        end if
      end repeat
    end try
  end repeat
  set AppleScript's text item delimiters to linefeed
  set outText to output as text
  set AppleScript's text item delimiters to ""
  return outText
end tell
`

export const FRONTMOST_SCRIPT =
  'tell application "System Events" to return name of (first process whose frontmost is true)'

/** Kept out of the hot path: fetching these per poll measured ~1.2s slower. */
export const APP_PATHS_SCRIPT = `
tell application "System Events"
  set output to {}
  repeat with proc in (every process whose background only is false)
    try
      set end of output to (name of proc) & "|||" & (POSIX path of (application file of proc))
    end try
  end repeat
  set AppleScript's text item delimiters to linefeed
  set outText to output as text
  set AppleScript's text item delimiters to ""
  return outText
end tell
`

export function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message)
      else resolve(stdout.trim())
    })
  })
}

/** Backslashes must be escaped before quotes. */
export function esc(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** By AX index, not title - duplicate titles would otherwise collide. */
export function focusWindow(appName: string, windowIndex: number): Promise<string> {
  const name = esc(appName)
  return runAppleScript(`
    tell application "${name}" to activate
    tell application "System Events"
      tell process "${name}"
        set frontmost to true
        try
          perform action "AXRaise" of window ${Number(windowIndex)}
        end try
      end tell
    end tell
  `)
}
