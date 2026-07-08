import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const ROOT = process.env.GROK_CC_HOME || path.join(os.homedir(), '.grok-cc')

export function sockPath() {
  return path.join(ROOT, 'broker.sock')
}

export function newId() {
  let r = ''
  for (let i = 0; i < 4; i++) r += Math.floor(Math.random() * 36).toString(36)
  return 'w' + Date.now().toString(36) + '-' + r
}

export function workerDir(id) {
  const d = path.join(ROOT, 'workers', id)
  fs.mkdirSync(d, { recursive: true })
  return d
}

export function appendJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(obj) + '\n')
}

export function readJsonl(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip unparsable
    }
  }
  return out
}

export function writeMeta(id, patch) {
  const prev = readMeta(id) || {}
  const meta = { ...prev, ...patch, updatedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(workerDir(id), 'meta.json'), JSON.stringify(meta))
  return meta
}

export function readMeta(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'workers', id, 'meta.json'), 'utf8'))
  } catch {
    return null
  }
}

export function listMetas() {
  let entries
  try {
    entries = fs.readdirSync(path.join(ROOT, 'workers'))
  } catch {
    return []
  }
  const out = []
  for (const id of entries) {
    const m = readMeta(id)
    if (m) out.push(m)
  }
  return out
}
