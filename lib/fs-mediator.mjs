import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { workerDir, appendJsonl, readMeta, writeMeta } from './store.mjs'

function pathEscape(msg = 'path escapes workspace') {
  const err = new Error(msg)
  err.code = 'PATH_ESCAPE'
  return err
}

/** Realpath nearest existing ancestor, then re-join missing suffix. */
function realpathNearest(absPath) {
  let cur = absPath
  const missing = []
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur)
    if (parent === cur) break
    missing.unshift(path.basename(cur))
    cur = parent
  }
  return path.join(fs.realpathSync(cur), ...missing)
}

/**
 * Resolve `p` under `rootDir`. Throws Error with code PATH_ESCAPE unless the
 * resolved path (via realpath of nearest existing ancestor) is inside rootDir.
 */
export function containedPath(rootDir, p) {
  const rootReal = fs.realpathSync(rootDir)
  const resolved = path.isAbsolute(p) ? path.resolve(p) : path.resolve(rootDir, p)
  const realResolved = realpathNearest(resolved)
  if (realResolved !== rootReal && !realResolved.startsWith(rootReal + path.sep)) {
    throw pathEscape()
  }
  return realResolved
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function audit(id, entry) {
  appendJsonl(path.join(workerDir(id), 'fs-audit.jsonl'), {
    ts: new Date().toISOString(),
    ...entry,
  })
}

function listStagedFiles(dir, base = '') {
  const out = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const rel = base ? path.join(base, ent.name) : ent.name
    if (ent.isDirectory()) out.push(...listStagedFiles(path.join(dir, ent.name), rel))
    else out.push(rel)
  }
  return out
}

export function makeFsHandlers(meta) {
  writeMeta(meta.id, { cwd: meta.cwd, grip: meta.grip })

  function containOrDeny(p) {
    try {
      return containedPath(meta.cwd, p)
    } catch (e) {
      if (e.code === 'PATH_ESCAPE') {
        audit(meta.id, { op: 'denied', path: p })
      }
      throw e
    }
  }

  return {
    async readTextFile({ path: p }) {
      const abs = containOrDeny(p)
      const content = fs.readFileSync(abs, 'utf8')
      audit(meta.id, {
        op: 'read',
        path: abs,
        bytes: Buffer.byteLength(content, 'utf8'),
        sha256: sha256(content),
      })
      return { content }
    },

    async writeTextFile({ path: p, content }) {
      const abs = containOrDeny(p)
      const rootReal = fs.realpathSync(meta.cwd)
      const rel = path.relative(rootReal, abs)
      const bytes = Buffer.byteLength(content, 'utf8')
      const hash = sha256(content)

      if (meta.grip === 'gate') {
        const staged = path.join(workerDir(meta.id), 'staged', rel)
        fs.mkdirSync(path.dirname(staged), { recursive: true })
        fs.writeFileSync(staged, content, 'utf8')
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, content, 'utf8')
      }

      audit(meta.id, { op: 'write', path: abs, bytes, sha256: hash })
      return {}
    },
  }
}

/**
 * Copy staged files for worker `id` into meta.cwd.
 * @param {string} id
 * @param {string[]|null} paths relative paths to apply, or null for all
 * @returns {string[]} applied relative paths
 */
export function applyStage(id, paths = null) {
  const meta = readMeta(id)
  if (!meta?.cwd) throw new Error(`no meta/cwd for worker ${id}`)
  const stagedRoot = path.join(workerDir(id), 'staged')
  let rels = listStagedFiles(stagedRoot)
  if (paths != null) {
    const want = new Set(paths)
    rels = rels.filter(r => want.has(r))
  }
  const applied = []
  for (const rel of rels) {
    const src = path.join(stagedRoot, rel)
    const dest = path.join(meta.cwd, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    applied.push(rel)
  }
  return applied
}
