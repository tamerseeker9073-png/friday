// Skills read-only del tablero: auditoría y capacidad del equipo.
// No escriben nada en ClickUp — solo leen y analizan.

const { getTareasTodos, estaTerminada } = require('../clickup/tasks');
const { estaAtrasada, calcularDemora } = require('../utils/dates');

// ── Auditoría del tablero ─────────────────────────────────────────────────────
async function auditarTablero() {
  const tareas  = await getTareasTodos();
  const activas = tareas.filter(t => !estaTerminada(t));
  const hallazgos = [];

  // Sin asignar
  const sinAsignar = activas.filter(t => !t.asignados || t.asignados.length === 0);
  if (sinAsignar.length) {
    hallazgos.push(`📌 ${sinAsignar.length} sin asignar: ${sinAsignar.slice(0, 6).map(t => t.nombre).join(', ')}${sinAsignar.length > 6 ? '…' : ''}`);
  }

  // Sin fecha límite
  const sinFecha = activas.filter(t => !t.fechaLimite);
  if (sinFecha.length) hallazgos.push(`📅 ${sinFecha.length} sin fecha límite.`);

  // Atrasadas
  const atrasadas = activas
    .filter(t => t.fechaLimite && estaAtrasada(t.fechaLimite))
    .sort((a, b) => calcularDemora(b.fechaLimite) - calcularDemora(a.fechaLimite));
  if (atrasadas.length) {
    const top = atrasadas.slice(0, 6).map(t => `${t.nombre} (${calcularDemora(t.fechaLimite)}d · ${t.asignados[0]?.nombre || 'sin asignar'})`);
    hallazgos.push(`🔴 ${atrasadas.length} atrasadas. Top: ${top.join(' · ')}`);
  }

  // Posibles duplicadas (mismo nombre + cliente)
  const seen = {}, dups = [];
  for (const t of activas) {
    const k = `${(t.nombre || '').toLowerCase().trim()}|${(t.cliente || '').toLowerCase().trim()}`;
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] === 2) dups.push(t.nombre);
  }
  if (dups.length) hallazgos.push(`♊ Posibles duplicadas: ${dups.slice(0, 6).join(', ')}`);

  // Sobrecarga (10+ tareas activas)
  const cnt = {};
  for (const t of activas) for (const a of t.asignados) cnt[a.nombre] = (cnt[a.nombre] || 0) + 1;
  const sobre = Object.entries(cnt).filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]);
  if (sobre.length) hallazgos.push(`⚠ Sobrecargados (10+): ${sobre.map(([n, c]) => `${n} (${c})`).join(', ')}`);

  return { total: activas.length, hallazgos };
}

// ── Capacidad / carga del equipo ──────────────────────────────────────────────
async function capacidadEquipo() {
  const tareas  = await getTareasTodos();
  const activas = tareas.filter(t => !estaTerminada(t));
  const cnt = {}, atr = {};
  for (const t of activas) {
    const tardia = t.fechaLimite && estaAtrasada(t.fechaLimite);
    for (const a of t.asignados) {
      cnt[a.nombre] = (cnt[a.nombre] || 0) + 1;
      if (tardia) atr[a.nombre] = (atr[a.nombre] || 0) + 1;
    }
  }
  const orden = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const sinAsignar = activas.filter(t => !t.asignados.length).length;
  return { orden, atr, sinAsignar, total: activas.length };
}

module.exports = { auditarTablero, capacidadEquipo };
