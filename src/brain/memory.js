// Historial de conversación por número (en memoria, se resetea al reiniciar)
const historiales = new Map();
const MAX_MENSAJES = 10;

function agregarMensaje(numero, role, content) {
  if (!historiales.has(numero)) historiales.set(numero, []);
  const historial = historiales.get(numero);
  historial.push({ role, content });
  if (historial.length > MAX_MENSAJES) historial.shift();
}

function getHistorial(numero) {
  return historiales.get(numero) || [];
}

function limpiarHistorial(numero) {
  historiales.delete(numero);
}

module.exports = { agregarMensaje, getHistorial, limpiarHistorial };
