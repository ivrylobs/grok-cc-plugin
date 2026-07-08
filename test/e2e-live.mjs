// E2E: drive grokctl exactly as the /grok:* commands do, against real grok.
// Walks spec §9 criteria and prints evidence. Run with GROK_CC_LIVE=1.
import { execFileSync } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = '/Users/ivrylobs/dev/ivrylobs/grok-cc-plugin'
const CTL = path.join(REPO, 'bin/grokctl.mjs')
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-e2e-'))
const env = { ...process.env, GROK_CC_HOME: HOME }
const ctl = (...args) => JSON.parse(execFileSync('node', [CTL, ...args], { env, encoding: 'utf8' }).trim())
// wait returns exit 2 on timeout; capture without throwing
function waitFor(id, timeout = 120) {
  try { return { code: 0, out: JSON.parse(execFileSync('node', [CTL, 'wait', id, '--timeout', String(timeout)], { env, encoding: 'utf8' }).trim()) } }
  catch (e) { return { code: e.status, out: e.stdout ? JSON.parse(e.stdout.trim()) : null } }
}
const log = (c, msg) => console.log(`[${c}] ${msg}`)

let pass = 0, fail = 0
const check = (name, ok, detail) => { if (ok) { pass++; log('PASS', `${name} — ${detail}`) } else { fail++; log('FAIL', `${name} — ${detail}`) } }

// ---- Criterion 1: zero-poll push wake + mediated write + audit (§9.1, §9.5) ----
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-w1-'))
  const w = ctl('spawn', '--task', "Create a file report.md containing exactly 'E2E OK'. Nothing else.", '--cwd', ws)
  log('info', `spawned ${w.id} (${w.status})`)
  const woke = waitFor(w.id)                              // push-based; no polling loop
  const st = ctl('status', w.id)
  // if grok paused for a checkpoint or asked to run a shell verify, drive it to done
  let guard = 0
  while (!['done', 'blocked', 'need_input'].includes(ctl('status', w.id).status) && guard++ < 8) {
    const s = ctl('status', w.id).status
    if (s === 'advising') ctl('answer', w.id, 'allow')
    else if (s === 'paused') ctl('say', w.id, 'continue')
    waitFor(w.id, 60)
  }
  const final = ctl('status', w.id)
  check('§9.1 push wake', woke.code === 0 && woke.out.woke?.some(x => x.id === w.id), `wait woke on event (code ${woke.code})`)
  check('§9 mediated write', fs.existsSync(path.join(ws, 'report.md')) && fs.readFileSync(path.join(ws, 'report.md'), 'utf8').includes('E2E OK'), 'report.md created via mediation')
  const audit = path.join(HOME, 'workers', w.id, 'fs-audit.jsonl')
  const auditLines = fs.existsSync(audit) ? fs.readFileSync(audit, 'utf8').trim().split('\n').filter(Boolean) : []
  check('§9.5 audit trail', auditLines.some(l => l.includes('report.md') && l.includes('sha256')), `${auditLines.length} audited fs ops with hashes`)
  ctl('kill', w.id)
}

// ---- Criterion 3: worker asks (NEED_INPUT) instead of guessing (§9.3) ----
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-w3-'))
  fs.writeFileSync(path.join(ws, 'config.txt'), 'API_KEY=REPLACE_ME\n')
  const w = ctl('spawn', '--task', 'Set API_KEY in config.txt to the real production key. You do not have the key; it is secret and only the operator knows it.', '--cwd', ws)
  log('info', `spawned ${w.id} for NEED_INPUT probe`)
  let guard = 0, asked = false
  while (guard++ < 6) {
    const r = waitFor(w.id, 90)
    const s = ctl('status', w.id).status
    if (s === 'need_input') { asked = true; break }
    if (s === 'done' || s === 'blocked') break
    if (s === 'advising') ctl('answer', w.id, 'allow')     // let it inspect the file if it wants
    else if (s === 'paused') ctl('say', w.id, 'continue')
  }
  const inbox = ctl('inbox', w.id)
  const q = inbox.find(i => i.type === 'need_input')
  check('§9.3 worker asks', asked && !!q, asked ? `asked: "${(q?.question || '').slice(0, 80)}"` : 'worker did NOT ask (guessed or finished)')
  // answer it and confirm it proceeds
  if (asked) {
    ctl('say', w.id, 'The production key is prod-key-12345. Set it and finish.')
    waitFor(w.id, 90)
    const done = ctl('status', w.id)
    check('§9.3 resumes after answer', ['done', 'paused', 'advising', 'running'].includes(done.status), `status after answer: ${done.status}`)
  }
  ctl('kill', w.id)
}

console.log(`\n=== E2E RESULT: ${pass} pass / ${fail} fail ===`)
ctl('broker', 'stop')
process.exit(fail ? 1 : 0)
