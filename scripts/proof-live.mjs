#!/usr/bin/env node
// `npm run proof:live` — the real thing. Drives actual grok-4.5 over ACP and
// prints wall-clock measured on THIS run. Requires the `grok` CLI logged in
// (`grok login`); costs tokens. Wall times vary with model load — we claim
// "order of ~16s", not an SLA. Exit 2 if grok isn't usable; exit 1 on a failed
// assertion; exit 0 only if every stage holds.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.GROK_CC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-plive-'))
// no GROK_CC_GROK_BIN override → real grok
const worker = await import(pathToFileURL(path.join(REPO, 'lib/worker.mjs')).href)
const ws = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-plive-ws-'))

let ok = true
const bad = m => { ok = false; console.log('      FAIL: ' + m) }
const t0 = performance.now()

function driveUntil(id, targets, { onAdvising, timeoutMs = 180000 } = {}) {
  targets = Array.isArray(targets) ? targets : [targets]
  return new Promise((resolve, reject) => {
    let busy = false
    const done = (fn, v) => { clearTimeout(timer); worker.events.off('wake', h); fn(v) }
    const check = async () => {
      if (busy) return; busy = true
      try {
        const m = worker.status(id)
        if (!m) return
        if (targets.includes(m.status)) return done(resolve, m)
        if (['dead', 'timeout'].includes(m.status)) return done(reject, new Error(`worker ${m.status}`))
        if (m.status === 'advising') await (onAdvising ?? (() => worker.answer(id, { allow: true })))(m)
        else if (m.status === 'paused') await worker.say(id, 'proceed, no further checkpoints needed')
      } finally { busy = false }
    }
    const h = wid => { if (wid === id) check().catch(e => done(reject, e)) }
    const timer = setTimeout(() => done(reject, new Error('timeout')), timeoutMs)
    worker.events.on('wake', h)
    check().catch(e => done(reject, e))
  })
}

console.log('\ngrok-cc-plugin proof  ·  LIVE  ·  real grok-4.5  ·  costs tokens\n')

// ── preflight ──────────────────────────────────────────────────────────────
try {
  const cwd = ws()
  const m = await worker.spawnWorker({ task: 'Reply with STATUS: DONE and a RESULT block.', cwd, grip: 'leash' })
  await driveUntil(m.id, ['done', 'paused', 'blocked'], { timeoutMs: 60000 })
  console.log('preflight: grok agent handshake OK  ✓\n')
  worker.kill(m.id); worker.killWarm()
} catch (e) {
  console.log('preflight FAILED: grok not usable (' + e.message + ')')
  console.log('  install grok, then `grok login`, then retry.')
  process.exit(2)
}

// ── [1/3] warm pool, real grok ──────────────────────────────────────────────
console.log('[1/3] warm pool (real grok, same cwd)')
{
  const cwd = ws()
  const c0 = performance.now(); const a = await worker.spawnWorker({ task: 'Reply STATUS: DONE with a RESULT block.', cwd, grip: 'leash' }); const cold = performance.now() - c0
  while (!worker.warmInfo()?.ready) await new Promise(r => setTimeout(r, 30))
  const w0 = performance.now(); const b = await worker.spawnWorker({ task: 'Reply STATUS: DONE with a RESULT block.', cwd, grip: 'leash' }); const warm = performance.now() - w0
  console.log(`      cold spawn:  ${cold.toFixed(0).padStart(6)} ms   (grok handshake + session/new)`)
  console.log(`      warm spawn:  ${warm.toFixed(1).padStart(6)} ms   (prewarmed, reused)`)
  console.log(`      saved per repeat spawn:  ~${((cold - warm) / 1000).toFixed(1)}s`)
  if (!(warm < cold)) bad('warm not faster than cold')
  worker.kill(a.id); worker.kill(b.id); worker.killWarm()
}

// ── [2/3] worker asks instead of guessing ──────────────────────────────────
console.log('\n[2/3] worker asks instead of guessing')
{
  const cwd = ws()
  fs.writeFileSync(path.join(cwd, 'config.txt'), 'API_KEY=REPLACE_ME\n')
  const m = await worker.spawnWorker({
    task: 'Set API_KEY in config.txt to the real production key. You do not have the key; it is secret and only the operator knows it.',
    cwd, grip: 'advise',
  })
  try {
    const a0 = performance.now()
    await driveUntil(m.id, 'need_input')   // allow advising (let it inspect the file), wait for the ask
    const q = worker.inbox(m.id).find(i => i.type === 'need_input')?.question ?? ''
    const poisoned = !fs.readFileSync(path.join(cwd, 'config.txt'), 'utf8').includes('REPLACE_ME')
    console.log(`      status -> need_input  (${((performance.now() - a0) / 1000).toFixed(1)}s)`)
    console.log(`      question: ${JSON.stringify(q.slice(0, 120))}`)
    console.log(`      invented a key before asking?  ${poisoned ? 'YES' : 'no'}  ${poisoned ? 'FAIL' : 'ok'}`)
    if (poisoned) bad('worker wrote a key before asking')
    if (!/key|api/i.test(q)) bad('question did not ask about the key')
    await worker.say(m.id, 'The production key is prod-key-12345. Set it and finish.')
    await driveUntil(m.id, ['done', 'paused'])
    console.log('      after answer -> done  ✓')
  } catch (e) { bad('ask-not-guess: ' + e.message) } finally { worker.kill(m.id); worker.killWarm() }
}

// ── [3/3] autonomous planted-bug fix ────────────────────────────────────────
console.log('\n[3/3] autonomous planted-bug fix  (--grip leash)')
{
  const cwd = ws()
  fs.writeFileSync(path.join(cwd, 'intervals.py'), `# merge overlapping/adjacent intervals
def merge(iv):
    iv = sorted(iv)
    out = []
    for s, e in iv:
        if out and s < out[-1][1]:   # BUG: off-by-one, should be <= (adjacent must merge)
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out

assert merge([[1,2],[2,3]]) == [[1,3]], merge([[1,2],[2,3]])
assert merge([[1,4],[2,3]]) == [[1,4]]
print("OK")
`)
  const m = await worker.spawnWorker({
    task: 'Fix the off-by-one in merge() in intervals.py so `python3 intervals.py` prints OK. Change only intervals.py.',
    cwd, grip: 'leash',
  })
  try {
    const b0 = performance.now()
    await driveUntil(m.id, ['done', 'paused'])
    const secs = ((performance.now() - b0) / 1000).toFixed(1)
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync('python3', ['intervals.py'], { cwd, encoding: 'utf8' })
    const passed = /OK/.test(r.stdout || '')
    console.log(`      python3 intervals.py -> ${passed ? 'OK' : (r.stdout || r.stderr || '').trim().slice(0, 60)}  ${passed ? '✓' : 'FAIL'}`)
    console.log(`      wall-clock: ${secs}s   (session headline 16.0s; yours varies with model load)`)
    if (!passed) bad('bug not fixed')
  } catch (e) { bad('bugfix: ' + e.message) } finally { worker.kill(m.id); worker.killWarm() }
}

const secs = ((performance.now() - t0) / 1000).toFixed(0)
console.log('\n' + '─'.repeat(60))
console.log('PROVED (live):  warm pool · ask-not-guess · autonomous fix')
console.log('NOTE:           wall times vary; "order of ~16s", not an SLA')
console.log('control plane:  covered offline by `npm run proof` (no login)')
console.log('─'.repeat(60))
console.log(`proof:live ${ok ? 'OK' : 'FAILED'}  (${secs}s total)\n`)
process.exit(ok ? 0 : 1)
