const axios = require('axios');

const BASE_URL = 'https://api.clickup.com/api/v2';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: process.env.CLICKUP_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Retry simple para errores de red o 429
async function request(method, path, params = {}, data = null, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const config = { method, url: path, params };
      if (data) config.data = data;
      const res = await client(config);
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || status >= 500) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`ClickUp: falló después de ${retries} intentos`);
}

async function getEspacios(workspaceId) {
  return request('get', `/team/${workspaceId}/space`, { archived: false });
}

async function getListas(spaceId) {
  const carpetas = await request('get', `/space/${spaceId}/folder`, { archived: false });
  const listasRaiz = await request('get', `/space/${spaceId}/list`, { archived: false });

  // Listas sin carpeta (sin cliente específico)
  const todasLasListas = (listasRaiz.lists || []).map(l => ({ ...l, carpetaNombre: null }));

  // Listas dentro de carpetas — la carpeta ES el cliente
  for (const carpeta of (carpetas.folders || [])) {
    const listasEnCarpeta = await request('get', `/folder/${carpeta.id}/list`, { archived: false });
    for (const lista of (listasEnCarpeta.lists || [])) {
      todasLasListas.push({ ...lista, carpetaNombre: carpeta.name });
    }
  }
  return todasLasListas;
}

async function getTareasPorLista(listaId, page = 0) {
  return request('get', `/list/${listaId}/task`, {
    archived: false,
    include_closed: false,
    subtasks: false,
    page,
  });
}

async function getTareasPorAsignado(workspaceId, assigneeId) {
  return request('get', `/team/${workspaceId}/task`, {
    assignees: [assigneeId],
    archived: false,
    include_closed: false,
    subtasks: false,
  });
}

async function marcarCompletada(taskId) {
  return request('put', `/task/${taskId}`, {}, { status: 'terminado' });
}

async function getCustomFields(listaId) {
  return request('get', `/list/${listaId}/field`);
}

// ── Operaciones de escritura ──────────────────────────────────────────────────

async function crearTarea(listaId, { nombre, asignados = [], dueDate = null, status = null }) {
  const body = { name: nombre };
  if (asignados.length) body.assignees = asignados.map(Number);
  if (dueDate) body.due_date = dueDate;
  if (status) body.status = status;
  return request('post', `/list/${listaId}/task`, {}, body);
}

async function cambiarStatus(taskId, status) {
  return request('put', `/task/${taskId}`, {}, { status });
}

async function reasignarTarea(taskId, addIds = [], remIds = []) {
  return request('put', `/task/${taskId}`, {}, {
    assignees: { add: addIds.map(Number), rem: remIds.map(Number) },
  });
}

async function getTarea(taskId) {
  return request('get', `/task/${taskId}`);
}

async function borrarTarea(taskId) {
  return request('delete', `/task/${taskId}`);
}

module.exports = {
  getEspacios,
  getListas,
  getTareasPorLista,
  getTareasPorAsignado,
  marcarCompletada,
  getCustomFields,
  crearTarea,
  cambiarStatus,
  reasignarTarea,
  getTarea,
  borrarTarea,
};
