import { execFile } from 'child_process'

/**
 * Lists every window of every visible process as "AppName|||Index|||Title".
 * Index is the real AX window index and counts windows we skip, so untitled
 * windows (menu extras, helpers) don't shift the indices of the ones we keep.
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

/**
 * Bundle paths for icon lookup. Deliberately kept out of the hot path: fetching
 * these alongside the window list measured ~1.2s slower per poll, and each
 * app's path is only needed once.
 */
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

/** AppleScript string literals need backslashes escaped before quotes. */
export function esc(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Raises a specific window by AX index, so duplicate titles stay distinct. */
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
