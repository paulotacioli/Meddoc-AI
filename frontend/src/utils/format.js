// ── utils/format.js ───────────────────────────────────────────
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function formatDate(date, opts = {}) {
  return new Date(date).toLocaleDateString('pt-BR', opts)
}
