// Estado de confirmaciones pendientes por número
// { numero → { taskId, taskName, timestamp } }
const pendientes = new Map();
const EXPIRACION_MS = 5 * 60 * 1000; // 5 minutos para confirmar

const KEYWORDS_SI = ['si', 'sí', 'yes', 'dale', 'confirmo', 'confirmado', 'ok', 'bueno', 'va'];
const KEYWORDS_NO = ['no', 'nope', 'cancelar', 'cancel', 'negativo'];

function setPendiente(numero, taskId, taskName) {
  pendientes.set(numero, { taskId, taskName, timestamp: Date.now() });
}

function getPendiente(numero) {
  const p = pendientes.get(numero);
  if (!p) return null;
  if (Date.now() - p.timestamp > EXPIRACION_MS) {
    pendientes.delete(numero);
    return null;
  }
  return p;
}

function limpiarPendiente(numero) {
  pendientes.delete(numero);
}

function esConfirmacion(texto) {
  const lower = texto.toLowerCase().trim();
  return KEYWORDS_SI.some(k => lower === k || lower.startsWith(k + ' '));
}

function esNegacion(texto) {
  const lower = texto.toLowerCase().trim();
  return KEYWORDS_NO.some(k => lower === k || lower.startsWith(k + ' '));
}

module.exports = { setPendiente, getPendiente, limpiarPendiente, esConfirmacion, esNegacion };
