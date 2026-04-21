// ── shared/realtime.js ────────────────────────────────────────
// Notificações em tempo real para médicos via WebSocket
// Mantém mapa de clínica → set de conexões WS ativas

const connections = new Map() // clinicId → Set<{ ws, userId, consultationId }>

function registerConnection(clinicId, ws, userId) {
  if (!connections.has(clinicId)) connections.set(clinicId, new Set())
  const conn = { ws, userId, registeredAt: Date.now() }
  connections.get(clinicId).add(conn)
  ws.on('close', () => connections.get(clinicId)?.delete(conn))
  return conn
}

function emitToClinic(clinicId, event, payload) {
  const conns = connections.get(clinicId)
  if (!conns) return
  const msg = JSON.stringify({ event, ...payload })
  conns.forEach(({ ws }) => {
    try {
      if (ws.readyState === 1) ws.send(msg)
    } catch {}
  })
}

function emitToUser(clinicId, userId, event, payload) {
  const conns = connections.get(clinicId)
  if (!conns) return
  const msg = JSON.stringify({ event, ...payload })
  conns.forEach(({ ws, userId: uid }) => {
    if (uid === userId) {
      try { if (ws.readyState === 1) ws.send(msg) } catch {}
    }
  })
}

module.exports = { registerConnection, emitToClinic, emitToUser }
