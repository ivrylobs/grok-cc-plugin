import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('handshake + capability probe classify extensions', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const { AcpClient } = await import('../lib/acp-client.mjs')
  const c = new AcpClient({ cwd: tmpWorkspace(), onUpdate: () => {} })
  const init = await c.handshake()
  assert.equal(init.protocolVersion, 1)
  assert.ok(init.agentCapabilities.loadSession)
  const { sessionId } = await c.request('session/new', { cwd: process.cwd(), mcpServers: [] })
  assert.ok(sessionId)
  const probes = await c.probeExtensions(sessionId)
  assert.equal(typeof probes['_x.ai/session/fork'], 'boolean')
  assert.equal(typeof probes['session/set_model'], 'boolean')
  c.kill()
})
