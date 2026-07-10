/**
 * Failing tests that lock the post-0.2.0 adviseAllowsShell rewrite (PLAN-0.2.0 item 1).
 *
 * Expected failures against today's lib/policy.mjs (pre-fix):
 *
 * ASK that currently ALLOW (must flip to ask after fix):
 *   - newline / CR / comment-newline / U+2028 smuggles  — backlog 0006
 *     (control-char class not rejected; only first line's head is matched)
 *
 * ALLOW that currently ASK (must flip to allow after fix):
 *   - `cat a && cat b`, `ls && rg foo .`                — backlog 0001
 *     (`&&` trips the bare-`&` branch of /[;&`<>]/ before any segment split)
 *   - head / wc / sed -n / test / find as heads         — backlog 0002
 *     (not in ADVISE_ALLOW; head/wc only in SAFE_FILTER as pipe tails)
 *
 * Cases that already pass today still assert the intended post-fix behavior
 * (metachar reject, danger flags, safe pipes, existing heads). Do not weaken
 * any assertion to make this file green before the rewrite lands.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
const { decideToolCall } = await import('../lib/policy.mjs')

const exec = cmd => ({ kind: 'execute', title: `Execute \`${cmd}\``, rawInput: { variant: 'Bash', command: cmd } })
const decide = cmd => decideToolCall('advise', exec(cmd))

// Build control chars with String.fromCharCode — never raw control literals.
const NL = String.fromCharCode(10)   // \n
const CR = String.fromCharCode(13)   // \r
const LS = String.fromCharCode(0x2028) // U+2028 LINE SEPARATOR

// ─── ASK: must not auto-allow ───────────────────────────────────────────────

test('advise asks on newline-smuggled second command (0006)', () => {
  const c = 'cat a' + NL + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'newline between cat and rm must ask')
})

test('advise asks on CR-smuggled second command (0006)', () => {
  const c = 'cat a' + CR + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'CR between cat and rm must ask')
})

test('advise asks on comment-newline smuggle (0006)', () => {
  const c = 'cat a #' + NL + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'comment-eaten first line + newline + rm must ask')
})

test('advise asks on U+2028-smuggled second command (0006)', () => {
  const c = 'cat a' + LS + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'U+2028 LINE SEPARATOR between cat and rm must ask')
})

test('advise asks on bare & background', () => {
  assert.equal(decide('cat a & cat b'), 'ask', 'bare & background must ask')
})

test('advise asks on semicolon chain', () => {
  assert.equal(decide('cat a; rm -rf x'), 'ask', '; chain must ask')
})

test('advise asks when && RHS is not allow-listed (0001)', () => {
  assert.equal(decide('cat a && rm -rf x'), 'ask', 'cat && rm must ask (RHS not allow-listed)')
})

test('advise asks on || with dangerous RHS (accidental safety preserved)', () => {
  assert.equal(decide('cat a || rm -rf x'), 'ask', '|| with rm RHS must ask')
})

test('advise asks on |& with dangerous RHS (accidental safety preserved)', () => {
  assert.equal(decide('cat a |& rm -rf x'), 'ask', '|& with rm RHS must ask')
})

test('advise asks on backtick substitution', () => {
  assert.equal(decide('cat `payload`'), 'ask', 'backtick substitution must ask')
})

test('advise asks on $(...) command substitution', () => {
  assert.equal(decide('cat $(payload)'), 'ask', '$(...) substitution must ask')
})

test('advise asks on process substitution <(...)', () => {
  assert.equal(decide('cat <(payload)'), 'ask', 'process substitution <(...) must ask')
})

test('advise asks on > redirect', () => {
  assert.equal(decide('cat a > /tmp/out'), 'ask', '> redirect must ask')
})

test('advise asks on sed -i (write-in-place danger guard, 0002)', () => {
  assert.equal(decide('sed -i s/a/b/ f'), 'ask', 'sed -i must ask')
})

test('advise asks on bare sed without -n (0002)', () => {
  assert.equal(decide('sed s/a/b/ f'), 'ask', 'bare sed (no -n) must ask')
})

test('advise asks on find -delete (0002)', () => {
  assert.equal(decide('find . -delete'), 'ask', 'find -delete must ask')
})

test('advise asks on find -exec (0002)', () => {
  assert.equal(decide('find . -exec rm {} ;'), 'ask', 'find -exec must ask')
})

test('advise asks on rg --pre (danger flag)', () => {
  assert.equal(decide('rg --pre sh x'), 'ask', 'rg --pre must ask')
})

test('advise asks when pipe target is not a safe filter', () => {
  assert.equal(decide('cat a | sh'), 'ask', 'pipe to non-filter sh must ask')
})

// ─── ALLOW: must still auto-allow (no regression / intended expansion) ──────

test('advise allows existing read-only heads', () => {
  for (const c of ['cat a', 'ls -la', 'rg -n foo src/', 'git status', 'git diff'])
    assert.equal(decide(c), 'allow', c)
})

test('advise allows allowed head piped to safe filter', () => {
  assert.equal(decide('cat a | tail -40'), 'allow', 'cat | tail must allow')
})

test('advise allows npm test 2>&1 | tail when GROK_CC_ADVISE_TESTS=1', () => {
  process.env.GROK_CC_ADVISE_TESTS = '1'
  try {
    assert.equal(decide('npm test 2>&1 | tail -5'), 'allow', 'npm test 2>&1 | tail -5 under ADVISE_TESTS must allow')
  } finally {
    delete process.env.GROK_CC_ADVISE_TESTS
  }
})

test('advise allows && of two allow-listed heads (0001)', () => {
  assert.equal(decide('cat a && cat b'), 'allow', 'cat a && cat b must allow')
})

test('advise allows && of ls and rg (0001)', () => {
  assert.equal(decide('ls && rg foo .'), 'allow', 'ls && rg foo . must allow')
})

test('advise allows head as head (0002)', () => {
  assert.equal(decide('head -20 f'), 'allow', 'head -20 f must allow')
})

test('advise allows wc as head (0002)', () => {
  assert.equal(decide('wc -l f'), 'allow', 'wc -l f must allow')
})

test('advise allows sed -n as head (0002)', () => {
  assert.equal(decide('sed -n 1,10p f'), 'allow', 'sed -n 1,10p f must allow')
})

test('advise allows test as head (0002)', () => {
  assert.equal(decide('test -f f'), 'allow', 'test -f f must allow')
})

test('advise allows find with read-ish predicates (0002)', () => {
  assert.equal(decide('find . -name x'), 'allow', 'find . -name x must allow')
})
