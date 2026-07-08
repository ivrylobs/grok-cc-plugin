import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const LIVE = process.env.GROK_CC_LIVE === '1'

export function tmpHome() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-live-'))
  process.env.GROK_CC_HOME = d
  return d
}

export function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-ws-'))
}
