// Skills read-only del tablero: auditoría y capacidad del equipo.
// No escriben nada en ClickUp — solo leen y analizan.

const { getTareasTodos, estaTerminada } = require('../clickup/tasks');
const { estaAtrasada, calcularDemora } = require('../utils/dates');

// ── Auditoría del tablero ─────────────────────────────────────────────────────
async function auditarTablero() {
  const tareas  = await getTareasTodos();
  const activas = tareas.filter(t => !estaTerminada(t));

  const atrasadas = activas
    .filter(t => t.fechaLimite && estaAtrasada(t.fechaLimite))
    .sort((a, b) => calcularDemora(b.fechaLimite) - calcularDemora(a.fechaLimite));

  const sinAsignar = activas.filter(t => !t.asignados || t.asignados.length === 0);
  const sinFecha   = activas.filter(t => !t.fechaLimite);

  const seen = {}, duplicadas = [];
  for (const t of activas) {
    const k = `${(t.nombre || '').toLowerCase().trim()}|${(t.cliente || '').toLowerCase().trim()}`;
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] === 2) duplicadas.push(t);
  }

  const cnt = {};
  for (const t of activas) for (const a of t.asignados) cnt[a.nombre] = (cnt[a.nombre] || 0) + 1;
  const sobrecargados = Object.entries(cnt).filter(([, n]) => n >= 10).sort((a, b) => b[1] - a[1]);

  return { total: activas.length, atrasadas, sinAsignar, sinFecha, duplicadas, sobrecargados };
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
