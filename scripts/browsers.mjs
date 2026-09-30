/**
 * Where the desktop browsers live.
 *
 * Windows first (the paths the CI box has), then the macOS bundles. Shared by
 * everything in this repo that needs a real browser, so a platform is either
 * supported by all of them or by none.
 *
 * @module browsers
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

export const BROWSER_CANDIDATES = [
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
]

/** The first candidate that exists, or undefined. */
export function findBrowser() {
  return BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
}
