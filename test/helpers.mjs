import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const LIVE = process.env.GROK_CC_LIVE === '1'
export const MOCK_BIN = path.resolve('test/mock-agent.mjs')

/** Fast tier by default: mock ACP agent. GROK_CC_LIVE=1 = real grok (truth pass). */
export function tmpHome() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-live-'))
  process.env.GROK_CC_HOME = d
  if (!LIVE) process.env.GROK_CC_GROK_BIN = MOCK_BIN
  return d
}

export function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-ws-'))
}

/**
 * Autopilot advisor: drive worker `id` until `target` status.
 * Default handlers: paused -> say continue; advising -> allow.
 * Override onPaused/onAdvising to test specific advisory behavior.
 */
export function driveUntil(worker, id, target, { timeoutMs = 300000, onPaused, onAdvising } = {}) {
  const targets = Array.isArray(target) ? target : [target]
  return new Promise((resolve, reject) => {
    let busy = false
    const finish = (fn, v) => { clearTimeout(timer); worker.events.off('wake', h); fn(v) }
    const check = async () => {
      if (busy) return
      busy = true
      try {
        const m = worker.status(id)
        if (!m) return
        if (targets.includes(m.status)) return finish(resolve, m)
        if (['dead', 'blocked'].includes(m.status)) return finish(reject, new Error(`worker ${m.status}`))
        if (m.status === 'paused') await (onPaused ?? (() => worker.say(id, 'Proceed. No further checkpoints needed.')))(m)
        else if (m.status === 'advising') await (onAdvising ?? (() => worker.answer(id, { allow: true })))(m)
      } finally { busy = false }
    }
    const h = wid => { if (wid === id) check().catch(e => finish(reject, e)) }
    const timer = setTimeout(() => finish(reject, new Error(`timeout waiting for ${target}`)), timeoutMs)
    worker.events.on('wake', h)
    check().catch(e => finish(reject, e))
  })
}
