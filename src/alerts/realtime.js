const { getTareasTodos } = require('../clickup/tasks');
const { getColaboradores } = require('../sheets/colaboradores');
const { alertaYaEnviada, marcarAlertaEnviada } = require('../state/manager');
const { enviarANumero } = require('../whatsapp/sender');
const { formatearFecha } = require('../utils/dates');

// Snapshot de tareas conocidas { taskId → assigneeIds[] }
let snapshotTareas = null;

function numeroDeColaborador(numero, clickupId, colaboradores) {
  for (const [num, colab] of colaboradores) {
    if (colab.clickupId === String(clickupId)) return num;
  }
  return null;
}

function mensajeNuevaTarea(tarea, nombreColaborador) {
  const fecha = tarea.fechaLimite ? formatearFecha(tarea.fechaLimite) : 'sin fecha límite';
  return `FRIDAY · Nueva tarea asignada 📋\n\n` +
         `*${tarea.nombre}*\n` +
         `Cliente: ${tarea.cliente}\n` +
         `Tipo: ${tarea.lista}\n` +
         `Fecha límite: ${fecha}\n` +
         `Estado: ${tarea.estado}`;
}

function mensajeUrgente(tarea) {
  const fecha = tarea.fechaLimite ? formatearFecha(tarea.fechaLimite) : 'sin fecha límite';
  return `FRIDAY · Tarea urgente ⚡\n\n` +
         `*${tarea.nombre}*\n` +
         `Cliente: ${tarea.cliente}\n` +
         `Fecha límite: ${fecha}\n\n` +
         `Por favor priorizala hoy.`;
}

async function verificarTareasNuevas() {
  try {
    const colaboradores = await getColaboradores();
    const tareas = await getTareasTodos();

    if (snapshotTareas === null) {
      // Primera corrida — solo guardamos snapshot, no alertamos
      snapshotTareas = new Map(tareas.map(t => [t.id, t.asignados.map(a => a.id)]));
      console.log(`[Realtime] Snapshot inicial: ${snapshotTareas.size} tareas`);
      return;
    }

    for (const tarea of tareas) {
      const asignadosAnteriores = snapshotTareas.get(tarea.id);

      // Tarea nueva (no estaba en snapshot)
      if (!asignadosAnteriores) {
        for (const asignado of tarea.asignados) {
          const num = numeroDeColaborador(null, asignado.id, colaboradores);
          if (!num) continue;
          if (alertaYaEnviada(tarea.id, 'nueva')) continue;

          enviarANumero(num, mensajeNuevaTarea(tarea, asignado.nombre));
          marcarAlertaEnviada(tarea.id, 'nueva');
          console.log(`[Realtime] Nueva tarea "${tarea.nombre}" → ${num}`);
        }
      }

      // Tarea urgente no alertada aún hoy
      if (tarea.esPrioritaria) {
        for (const asignado of tarea.asignados) {
          const num = numeroDeColaborador(null, asignado.id, colaboradores);
          if (!num) continue;
          if (alertaYaEnviada(tarea.id, 'urgente')) continue;

          enviarANumero(num, mensajeUrgente(tarea));
          marcarAlertaEnviada(tarea.id, 'urgente');
          console.log(`[Realtime] Urgente "${tarea.nombre}" → ${num}`);
        }
      }
    }

    // Actualizar snapshot
    snapshotTareas = new Map(tareas.map(t => [t.id, t.asignados.map(a => a.id)]));

  } catch (err) {
    console.error('[Realtime] Error en verificación:', err.message);
  }
}

function iniciarPolling() {
  const INTERVALO_MS = 3 * 60 * 1000; // 3 minutos
  verificarTareasNuevas(); // Primera corrida inmediata
  setInterval(verificarTareasNuevas, INTERVALO_MS);
  console.log('[Realtime] Polling iniciado (cada 3 minutos)');
}

module.exports = { iniciarPolling, verificarTareasNuevas };
