const { getListas, getTareasPorLista, getTareasPorAsignado } = require('./api');
const { calcularDemora, estaAtrasada, venceHoy, venceEnDias } = require('../utils/dates');

const WORKSPACE_ID = process.env.CLICKUP_WORKSPACE_ID;
const ESPACIOS = [
  process.env.CLICKUP_SPACE_SOCIAL_MEDIA || '90138654326',
  process.env.CLICKUP_SPACE_SM_MOTOS || '901313721071',
];

const ESTADOS_TERMINADO = ['terminado', 'complete', 'closed', 'done'];

function extraerFechaLimite(tarea) {
  // Primero buscar custom field FECHA DE PUBLICACION
  if (tarea.custom_fields) {
    const campoPub = tarea.custom_fields.find(f =>
      f.name?.toLowerCase().includes('fecha de publicacion') ||
      f.name?.toLowerCase().includes('publicación')
    );
    if (campoPub?.value) {
      const ts = parseInt(campoPub.value);
      if (!isNaN(ts)) return new Date(ts);
      const d = new Date(campoPub.value);
      if (!isNaN(d.getTime())) return d;
    }
  }
  // Fallback a due_date de ClickUp
  if (tarea.due_date) {
    return new Date(parseInt(tarea.due_date));
  }
  return null;
}

function normalizarTarea(tarea, nombreLista, carpetaNombre) {
  const fechaLimite = extraerFechaLimite(tarea);
  const asignados = (tarea.assignees || []).map(a => ({
    id: String(a.id),
    nombre: a.username || a.email || String(a.id),
  }));

  const tags = (tarea.tags || []).map(t => t.name?.toLowerCase());
  const esPrioritaria = tags.includes('urgent') || tags.includes('urgente') ||
                        tarea.priority?.priority === 'urgent' ||
                        tarea.priority?.priority === 'high';

  // La carpeta es el cliente; la lista es el tipo de tarea (Reels, CM, etc.)
  const cliente = carpetaNombre || tarea.folder?.name || nombreLista;

  return {
    id: tarea.id,
    nombre: tarea.name,
    estado: tarea.status?.status || 'desconocido',
    fechaLimite,
    lista: nombreLista,
    cliente,
    asignados,
    tags,
    esPrioritaria,
    creadaEn: tarea.date_created ? new Date(parseInt(tarea.date_created)) : null,
  };
}

function estaTerminada(tarea) {
  return ESTADOS_TERMINADO.includes(tarea.estado?.toLowerCase());
}

async function getTareasDeEspacio(spaceId) {
  const listas = await getListas(spaceId);
  const tareas = [];

  for (const lista of listas) {
    let page = 0;
    while (true) {
      const res = await getTareasPorLista(lista.id, page);
      const batch = (res.tasks || []).map(t => normalizarTarea(t, lista.name, lista.carpetaNombre));
      tareas.push(...batch);
      if (!res.last_page && res.tasks?.length === 100) {
        page++;
      } else {
        break;
      }
    }
  }

  return tareas;
}

async function getTareasDeColaborador(clickupId) {
  const res = await getTareasPorAsignado(WORKSPACE_ID, clickupId);
  return (res.tasks || []).map(t => normalizarTarea(t, t.list?.name || ''));
}

async function getTareasTodos() {
  const todas = [];
  for (const spaceId of ESPACIOS) {
    const tareas = await getTareasDeEspacio(spaceId);
    todas.push(...tareas);
  }
  return todas;
}

function clasificarTareasParaColaborador(todasLasTareas, clickupId) {
  const propias = todasLasTareas.filter(t =>
    !estaTerminada(t) &&
    t.asignados.some(a => a.id === String(clickupId))
  );

  const atrasadas = propias
    .filter(t => t.fechaLimite && estaAtrasada(t.fechaLimite))
    .sort((a, b) => calcularDemora(b.fechaLimite) - calcularDemora(a.fechaLimite));

  const paraHoy = propias.filter(t => t.fechaLimite && venceHoy(t.fechaLimite));

  const proximamente = propias.filter(t =>
    t.fechaLimite &&
    !venceHoy(t.fechaLimite) &&
    !estaAtrasada(t.fechaLimite) &&
    venceEnDias(t.fechaLimite, 3)
  );

  return { atrasadas, paraHoy, proximamente };
}

module.exports = {
  getTareasTodos,
  getTareasDeEspacio,
  getTareasDeColaborador,
  clasificarTareasParaColaborador,
  normalizarTarea,
  estaTerminada,
};
