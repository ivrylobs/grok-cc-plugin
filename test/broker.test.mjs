import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GROKD = fileURLToPath(new URL('../bin/grokd.mjs', import.meta.url))

// Regression: the first real run failed with EACCES because ~/.grok-cc did not
// exist — every test until now handed the broker an mkdtemp'd dir that did.
test('broker creates its state dir before binding the socket', async t => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-broker-')), 'does', 'not', 'exist')
  assert.equal(fs.existsSync(home), false)

  const child = spawn(process.execPath, [GROKD], { env: { ...process.env, GROK_CC_HOME: home }, stdio: 'ignore' })
  t.after(() => child.kill('SIGKILL'))

  const sock = path.join(home, 'broker.sock')
  const deadline = Date.now() + 10_000
  while (!fs.existsSync(sock)) {
    assert.ok(Date.now() < deadline, 'broker never created its socket')
    await new Promise(r => setTimeout(r, 50))
  }

  const reply = await new Promise((resolve, reject) => {
    const c = net.connect(sock)
    c.on('error', reject)
    c.on('connect', () => c.write(JSON.stringify({ id: 1, op: 'ping' }) + '\n'))
    c.on('data', d => { resolve(JSON.parse(d.toString().split('\n')[0])); c.end() })
  })
  assert.equal(reply.ok, true)
  assert.equal(reply.data.pid, child.pid)
})
