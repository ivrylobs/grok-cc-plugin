import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ROOT } from './store.mjs'

// Force grok workers to route EVERY tool call through the ACP client's
// permission gate, regardless of the user's global ~/.grok/config.toml
// (which may set permission_mode="auto" and silently auto-run commands).
// We build a managed GROK_HOME that symlinks the real one but overrides
// config.toml. Verified 2026-07-09 (grok 0.2.91): without this, `mkdir`
// executes with no session/request_permission — the grip gate is bypassed.
const MANAGED_CONFIG = `[ui]
permission_mode = "default"

[features]
support_permission = true
`

let cached

/** Base = the user's real grok home (honors their GROK_HOME override). */
function baseHome() {
  return process.env.GROK_CC_GROK_HOME_BASE || process.env.GROK_HOME || path.join(os.homedir(), '.grok')
}

/**
 * Return a managed GROK_HOME dir that forces client-authoritative permissions,
 * or null if the base grok home doesn't exist (e.g. mock-only environments).
 * Rebuilt each process-start so auth/model symlinks stay fresh.
 */
export function managedGrokHome() {
  if (cached !== undefined) return cached
  const base = baseHome()
  if (!fs.existsSync(base)) return (cached = null)
  const dir = path.join(ROOT, 'grok-home')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  for (const name of fs.readdirSync(base)) {
    if (name === 'config.toml') continue          // we supply our own
    try { fs.symlinkSync(path.join(base, name), path.join(dir, name)) } catch { /* skip unreadable */ }
  }
  fs.writeFileSync(path.join(dir, 'config.toml'), MANAGED_CONFIG)
  return (cached = dir)
}
