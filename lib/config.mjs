import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './store.mjs'

// Worker model/effort defaults. Precedence (highest first):
//   1. per-spawn flag (--model / --effort)
//   2. env: GROK_CC_MODEL / GROK_CC_EFFORT
//   3. <GROK_CC_HOME>/config.json  {"model": "...", "effort": "..."}
//   4. null -> grok's own default
// Verified 2026-07-09 (grok 0.2.91): session/set_model takes {sessionId, modelId};
// session/set_mode takes {sessionId, modeId} with modeId in EFFORTS.

export const EFFORTS = ['low', 'medium', 'high']

const configFile = () => path.join(ROOT, 'config.json')

export function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) } catch { return {} }
}

export function writeConfig(patch) {
  const merged = { ...readConfig(), ...patch }
  for (const k of Object.keys(merged)) if (merged[k] == null) delete merged[k]
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(merged, null, 2) + '\n')
  return merged
}

/** Resolve model/effort for a spawn, applying precedence. Throws on a bad effort. */
export function resolveModelEffort({ model = null, effort = null } = {}) {
  const cfg = readConfig()
  const m = model ?? process.env.GROK_CC_MODEL ?? cfg.model ?? null
  const e = effort ?? process.env.GROK_CC_EFFORT ?? cfg.effort ?? null
  if (e != null && !EFFORTS.includes(e)) {
    throw new Error(`invalid effort "${e}"; expected one of ${EFFORTS.join('|')}`)
  }
  return { model: m, effort: e }
}
