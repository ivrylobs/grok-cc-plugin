/**
 * Parse worker protocol status from agent text.
 * @param {string} text
 * @returns {{ status: string, question: string|null, result: object|null, raw: string }}
 */
export function parseStatus(text) {
  const raw = text
  const statusMatches = [...text.matchAll(/^STATUS:\s*(WORKING|NEED_INPUT|DONE|BLOCKED)\s*$/gm)]
  const status = statusMatches.length
    ? statusMatches[statusMatches.length - 1][1]
    : null

  if (!status) {
    return { status: 'DONE', question: null, result: { summary: text }, raw }
  }

  if (status === 'DONE') {
    const fence = [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)]
    const block = fence.length ? fence[fence.length - 1][1] : null
    if (block != null) {
      try {
        const result = JSON.parse(block)
        return { status: 'DONE', question: null, result, raw }
      } catch {
        // malformed JSON → degrade
      }
    }
    return { status: 'DONE', question: null, result: { summary: text }, raw }
  }

  if (status === 'NEED_INPUT') {
    const q = text.match(/^QUESTION:\s*(.+)$/m)
    return {
      status: 'NEED_INPUT',
      question: q ? q[1].trim() : null,
      result: null,
      raw,
    }
  }

  // WORKING | BLOCKED
  return { status, question: null, result: null, raw }
}
