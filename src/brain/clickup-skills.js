// ClickUp write skills for FRIDAY admin.
// Skill #1 — conversational ClickUp (create / move / reassign single task)
// Skill #2 — batch piece creation
// Skill #5 — monthly close report

'use strict';

const { generarTexto } = require('./claude');
const { crearTarea, cambiarStatus, reasignarTarea, getTareasPorLista } = require('../clickup/api');
const { resolverCliente, resolverTipoKey, getListaId, nombresClientes, CLIENTES_SOCIAL_MEDIA, SOCIAL_MEDIA_SPACE_ID } = require('../clickup/mapa');
const { getListas } = require('../clickup/api');
const { getColaboradores } = require('../sheets/colaboradores');
const { enviarANumero } = require('../whatsapp/sender');
const { escribirProduccionMensual } = require('../sheets/produccion');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getNumeroByClickupId(clickupId) {
  const { getColaboradores } = require('../sheets/colaboradores');
  const todos = await getColaboradores();
  for (const [num, data] of todos) {
    if (String(data.clickupId) === String(clickupId)) return num;
  }
  return null;
}

// ── Pending ClickUp operations store ─────────────────────────────────────────
// Separate from confirmations.js (which owns task-completion flow).
// { numero → { tipo: 'clickup_op', accion, payload, resumen, timestamp } }
const pendingOps = new Map();
const EXPIRACION_MS = 5 * 60 * 1000;

function setPendingOp(numero, accion, payload, resumen) {
  pendingOps.set(numero, { tipo: 'clickup_op', accion, payload, resumen, timestamp: Date.now() });
}

function getPendingOp(numero) {
  const p = pendingOps.get(numero);
  if (!p) return null;
  if (Date.now() - p.timestamp > EXPIRACION_MS) {
    pendingOps.delete(numero);
    return null;
  }
  return p;
}

function clearPendingOp(numero) {
  pendingOps.delete(numero);
}

// ── Intent detection via single Claude call ───────────────────────────────────

const INTENT_SYSTEM = `Sos un asistente que extrae la intención de mensajes de WhatsApp en una agencia creativa.
Dado el mensaje del usuario, devolvé ÚNICAMENTE un JSON válido (sin markdown, sin texto extra) con esta forma:

Para crear una tarea:
{"accion":"crear","cliente":"<nombre>","tipo":"<reels|flyers|cm>","nombre":"<nombre tarea o null>"}

Para mover de status:
{"accion":"mover","tarea":"<nombre tarea>","status":"<nuevo status>"}

Para reasignar:
{"accion":"reasignar","tarea":"<nombre tarea>","colaborador":"<nombre persona>"}

Si el mensaje no es una operación de ClickUp:
{"accion":"ninguna"}

Si falta información clave (cliente no identificado, tipo no identificado):
{"accion":"ambiguo","falta":"<que falta: cliente|tipo|ambos>","mensaje":"<pregunta concisa para aclarar>"}

Clientes disponibles: ${nombresClientes().join(', ')}.
Tipos: reels, flyers (incluye historias/carrouseles/stories), cm.
No inventes clientes. Si el nombre es ambiguo, marcá accion="ambiguo".`;

async function detectarIntencionClickup(texto) {
  try {
    const raw = await generarTexto(INTENT_SYSTEM, texto, 256);
    // Strip possible markdown code fences
    const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('[ClickupSkills] Intent parse error:', e.message);
    return { accion: 'ninguna' };
  }
}

// ── Skill #1 — Conversational ClickUp ────────────────────────────────────────

/**
 * Main entry: process an admin message for a single ClickUp operation.
 * Returns true if the message was handled (so handler.js can return early).
 */
async function manejarClickupConversacional(numero, texto) {
  const intent = await detectarIntencionClickup(texto);

  if (!intent || intent.accion === 'ninguna') return false;

  if (intent.accion === 'ambiguo') {
    enviarANumero(numero, intent.mensaje || '¿Me podés dar más detalles? (cliente, tipo o nombre de tarea)');
    return true;
  }

  if (intent.accion === 'crear') {
    return await _manejarCrear(numero, intent);
  }

  if (intent.accion === 'mover') {
    return await _manejarMover(numero, intent);
  }

  if (intent.accion === 'reasignar') {
    return await _manejarReasignar(numero, intent);
  }

  return false;
}

async function _manejarCrear(numero, intent) {
  const clienteEntry = resolverCliente(intent.cliente);
  if (!clienteEntry) {
    enviarANumero(numero, `No encontré el cliente "${intent.cliente}". Clientes disponibles: ${nombresClientes().join(', ')}.`);
    return true;
  }

  const tipoKey = resolverTipoKey(intent.tipo) || 'flyers';
  const listaId = getListaId(clienteEntry, tipoKey);
  if (!listaId) {
    enviarANumero(numero, `El cliente "${intent.cliente}" no tiene lista de ${intent.tipo}.`);
    return true;
  }

  const nombreTarea = intent.nombre || `Nueva tarea (${intent.tipo})`;
  const tipoLabel = tipoKey === 'reels' ? 'Reels' : tipoKey === 'cm' ? 'CM' : 'Flyers/Carrouseles';
  const clienteLabel = clienteEntry.alias[0];
  const resumen = `Crear "${nombreTarea}" en ${tipoLabel} de ${clienteLabel}`;

  setPendingOp(numero, 'crear', { listaId, nombre: nombreTarea, clienteLabel, tipoLabel }, resumen);
  enviarANumero(numero, `Voy a ${resumen}. ¿Confirmar? (sí/no)`);
  return true;
}

async function _manejarMover(numero, intent) {
  if (!intent.tarea || !intent.status) {
    enviarANumero(numero, '¿A qué status querés mover? Ej: "mové Promo julio a edición".');
    return true;
  }

  // We store tarea name + status; execution resolves task ID at confirmation time
  // by searching across lists. For now, store what we know and resolve on confirm.
  const resumen = `Mover "${intent.tarea}" a status "${intent.status}"`;
  setPendingOp(numero, 'mover', { tareaNombre: intent.tarea, status: intent.status }, resumen);
  enviarANumero(numero, `Voy a ${resumen}. ¿Confirmar? (sí/no)`);
  return true;
}

async function _manejarReasignar(numero, intent) {
  if (!intent.tarea || !intent.colaborador) {
    enviarANumero(numero, '¿A quién querés reasignar y qué tarea? Ej: "reasigná Promo julio a Galo".');
    return true;
  }

  // Resolve collaborator by name
  const colaboradores = await getColaboradores();
  const needle = intent.colaborador.toLowerCase();
  const encontrado = [...colaboradores.values()].find(c =>
    c.nombre.toLowerCase().includes(needle) || needle.includes(c.nombre.toLowerCase())
  );

  if (!encontrado || !encontrado.clickupId) {
    enviarANumero(numero, `No encontré colaborador con nombre "${intent.colaborador}" o no tiene ID de ClickUp.`);
    return true;
  }

  const resumen = `Reasignar "${intent.tarea}" a ${encontrado.nombre}`;
  setPendingOp(numero, 'reasignar', {
    tareaNombre: intent.tarea,
    colaboradorId: encontrado.clickupId,
    colaboradorNombre: encontrado.nombre,
  }, resumen);
  enviarANumero(numero, `Voy a ${resumen}. ¿Confirmar? (sí/no)`);
  return true;
}

/**
 * Execute a confirmed pending ClickUp operation.
 * Called from handler.js when esConfirmacion() is true and getPendingOp() is set.
 */
async function ejecutarOpPendiente(numero) {
  const op = getPendingOp(numero);
  if (!op) return false;

  clearPendingOp(numero);

  try {
    if (op.accion === 'crear') {
      const { listaId, nombre, clienteLabel, tipoLabel } = op.payload;
      const tarea = await crearTarea(listaId, { nombre });
      enviarANumero(numero, `✅ Tarea creada: "${tarea.name}" en ${tipoLabel} de ${clienteLabel}.`);
      return true;
    }

    if (op.accion === 'mover') {
      const { tareaNombre, status } = op.payload;
      // Search task by name across Social Media lists
      const taskId = await _buscarTareaId(tareaNombre);
      if (!taskId) {
        enviarANumero(numero, `No encontré una tarea con nombre "${tareaNombre}". Verificá el nombre exacto.`);
        return true;
      }
      await cambiarStatus(taskId, status);
      enviarANumero(numero, `✅ "${tareaNombre}" movida a "${status}".`);
      return true;
    }

    if (op.accion === 'reasignar') {
      const { tareaNombre, colaboradorId, colaboradorNombre } = op.payload;
      const taskId = await _buscarTareaId(tareaNombre);
      if (!taskId) {
        enviarANumero(numero, `No encontré una tarea con nombre "${tareaNombre}". Verificá el nombre exacto.`);
        return true;
      }
      await reasignarTarea(taskId, [colaboradorId]);
      enviarANumero(numero, `✅ "${tareaNombre}" reasignada a ${colaboradorNombre}.`);
      // Notify the reassigned collaborator
      const assigneeNum = await getNumeroByClickupId(colaboradorId);
      if (assigneeNum && assigneeNum !== numero) {
        const msg = `📋 *FRIDAY te asignó tareas nuevas*\n\n• Tarea: *${tareaNombre}*\n\nRevisalas en ClickUp cuando puedas.`;
        enviarANumero(assigneeNum, msg);
      }
      return true;
    }
  } catch (err) {
    console.error('[ClickupSkills] Error ejecutando op:', err.message);
    enviarANumero(numero, 'Hubo un error ejecutando la operación. Intentá de nuevo.');
  }

  return false;
}

/**
 * Search for a task by name across all Social Media lists.
 * Returns the task ID (string) or null.
 */
async function _buscarTareaId(nombreBuscado) {
  const needle = nombreBuscado.toLowerCase().trim();
  for (const [, entry] of Object.entries(CLIENTES_SOCIAL_MEDIA)) {
    const listaIds = [entry.reels, entry.flyers, entry.cm].filter(Boolean);
    for (const listaId of listaIds) {
      try {
        const res = await getTareasPorLista(listaId);
        const found = (res.tasks || []).find(t =>
          t.name?.toLowerCase().includes(needle) || needle.includes(t.name?.toLowerCase())
        );
        if (found) return found.id;
      } catch (_) {
        // Skip lists that error
      }
    }
  }
  return null;
}

// ── Skill #2 — Batch piece creation ──────────────────────────────────────────

// Map of piece-type words → list key (reels / flyers / cm)
const TIPO_BATCH_MAP = {
  reel: 'reels', reels: 'reels', video: 'reels', videos: 'reels',
  flyer: 'flyers', flyers: 'flyers',
  historia: 'flyers', historias: 'flyers',
  story: 'flyers', stories: 'flyers',
  carrusel: 'flyers', carrousel: 'flyers', carousel: 'flyers',
  post: 'flyers', posts: 'flyers',
  cm: 'cm', community: 'cm',
};

/**
 * Parse a batch message and return { clienteEntry, piezas: [{tipo, cantidad, nombre}] }
 * or null if the message doesn't look like a batch request.
 *
 * Accepted patterns:
 *   "creá reels, flyer e historia para Fausol"
 *   "agendá para Grosso: 2 reels y 3 flyers"
 *   "creá para Motomel 1 reel y 2 flyers sobre promo agosto"
 */
function _parsearBatch(texto) {
  // Require at least 2 type words to distinguish from Skill #1
  const lower = texto.toLowerCase();

  // Find client
  let clienteEntry = null;
  for (const [, entry] of Object.entries(CLIENTES_SOCIAL_MEDIA)) {
    if (entry.alias.some(a => lower.includes(a))) {
      clienteEntry = entry;
      break;
    }
  }
  if (!clienteEntry) return null;

  // Extract optional description after "sobre" / "acerca"
  const sobreMatch = lower.match(/(?:sobre|acerca de?)\s+(.+)$/);
  const descripcion = sobreMatch ? sobreMatch[1].trim() : null;

  // Find all "N tipo" occurrences — e.g. "2 reels", "3 flyers", "1 reel"
  const piezas = [];
  const patronCantidad = /(\d+)\s+(reels?|videos?|flyers?|historias?|stories|story|carrous?els?|posts?|cm|community)/gi;
  let m;
  while ((m = patronCantidad.exec(lower)) !== null) {
    const cantidad = parseInt(m[1], 10);
    const palabra = m[2].replace(/s$/, '').replace(/e$/, ''); // rough singular
    const tipoKey = TIPO_BATCH_MAP[m[2]] || TIPO_BATCH_MAP[palabra] || 'flyers';
    piezas.push({ tipoKey, cantidad, palabra: m[2] });
  }

  // Also collect type words without quantity (e.g. "reel, flyer e historia")
  if (piezas.length === 0) {
    // Split on common conjunctions and commas, look for type words
    const partes = lower.split(/,|\be\b|\by\b|\bé\b/);
    for (const parte of partes) {
      const palabra = parte.trim().split(/\s+/).find(w => TIPO_BATCH_MAP[w]);
      if (palabra) {
        piezas.push({ tipoKey: TIPO_BATCH_MAP[palabra], cantidad: 1, palabra });
      }
    }
  }

  if (piezas.length < 2) return null; // Not a batch — single type, let Skill #1 handle it

  return { clienteEntry, piezas, descripcion };
}

/**
 * Main entry for Skill #2. Returns true if handled.
 */
async function manejarBatchPiezas(numero, texto) {
  const parsed = _parsearBatch(texto);
  if (!parsed) return false;

  const { clienteEntry, piezas, descripcion } = parsed;
  const clienteLabel = clienteEntry.alias[0];

  // Build task list
  const tareasList = [];
  for (const { tipoKey, cantidad, palabra } of piezas) {
    const listaId = getListaId(clienteEntry, tipoKey);
    if (!listaId) continue;
    const tipoLabel = tipoKey === 'reels' ? 'Reels' : tipoKey === 'cm' ? 'CM' : 'Flyers/Carrouseles';
    for (let i = 0; i < cantidad; i++) {
      const nombre = descripcion
        ? `${capitalizar(palabra)} — ${descripcion}${cantidad > 1 ? ` (${i + 1})` : ''}`
        : `Nueva pieza (${palabra})${cantidad > 1 ? ` ${i + 1}` : ''}`;
      tareasList.push({ listaId, nombre, tipoLabel });
    }
  }

  if (tareasList.length === 0) {
    enviarANumero(numero, `No pude determinar en qué listas crear las tareas para ${clienteLabel}.`);
    return true;
  }

  const resumenLineas = tareasList.map(t => `• ${t.tipoLabel}: "${t.nombre}"`).join('\n');
  const resumen = `Crear ${tareasList.length} tarea${tareasList.length > 1 ? 's' : ''} para ${clienteLabel}:\n${resumenLineas}`;

  setPendingOp(numero, 'batch_crear', { tareasList, clienteLabel }, resumen);
  enviarANumero(numero, `${resumen}\n\n¿Confirmar? (sí/no)`);
  return true;
}

/**
 * Execute a confirmed batch creation.
 */
async function ejecutarBatchPendiente(numero) {
  const op = getPendingOp(numero);
  if (!op || op.accion !== 'batch_crear') return false;

  clearPendingOp(numero);
  const { tareasList, clienteLabel } = op.payload;

  let creadas = 0;
  const errores = [];
  // Track created tasks per assignee for consolidated notifications
  // assigneeId → [{ nombre, clienteLabel }]
  const tareasPorAsignado = new Map();

  for (const { listaId, nombre } of tareasList) {
    try {
      const tarea = await crearTarea(listaId, { nombre });
      creadas++;
      if (tarea.assignees && tarea.assignees.length) {
        for (const assignee of tarea.assignees) {
          const id = String(assignee.id);
          if (!tareasPorAsignado.has(id)) tareasPorAsignado.set(id, []);
          tareasPorAsignado.get(id).push({ nombre: tarea.name, clienteLabel });
        }
      }
    } catch (err) {
      console.error('[ClickupSkills] Error creando tarea batch:', err.message);
      errores.push(nombre);
    }
  }

  let msg = `✅ Creadas ${creadas} tarea${creadas !== 1 ? 's' : ''} para ${clienteLabel}.`;
  if (errores.length) {
    msg += `\n\n⚠️ No se pudieron crear: ${errores.join(', ')}.`;
  }
  enviarANumero(numero, msg);

  // Send consolidated assignment notifications
  for (const [assigneeId, tareas] of tareasPorAsignado) {
    const assigneeNum = await getNumeroByClickupId(assigneeId);
    if (assigneeNum && assigneeNum !== numero) {
      const lineas = tareas.map(t => `• Tarea: *${t.nombre}* — ${t.clienteLabel}`).join('\n');
      enviarANumero(assigneeNum, `📋 *FRIDAY te asignó tareas nuevas*\n\n${lineas}\n\nRevisalas en ClickUp cuando puedas.`);
    }
  }

  return true;
}

// ── Skill #5 — Monthly close report ──────────────────────────────────────────

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Build and send the monthly close report.
 * Fetches all tasks from the Social Media space, filters terminado in the current month,
 * groups by client and type, and sends to admin + group.
 *
 * @param {string} adminNumero - WhatsApp number of the admin
 * @param {Date}   [fecha]     - reference date (defaults to now)
 */
async function ejecutarCierreMensual(adminNumero, fecha) {
  const ref = fecha || new Date();
  const mes = ref.getMonth();   // 0-indexed
  const anio = ref.getFullYear();

  const inicioMes = new Date(anio, mes, 1).getTime();
  const finMes    = new Date(anio, mes + 1, 0, 23, 59, 59, 999).getTime();

  enviarANumero(adminNumero, `Generando cierre de ${MESES_ES[mes]}... un momento.`);

  let todasLasListas;
  try {
    todasLasListas = await getListas(SOCIAL_MEDIA_SPACE_ID);
  } catch (err) {
    console.error('[CierreMensual] Error fetching lists:', err.message);
    enviarANumero(adminNumero, 'No pude obtener las listas de ClickUp. Intentá de nuevo.');
    return;
  }

  // Group: clienteNombre → { reels: N, flyers: N, cm: N }
  const counts = {};

  for (const lista of todasLasListas) {
    // Determine type key from list name
    const listaNombre = (lista.name || '').toLowerCase();
    let tipoKey;
    if (listaNombre.includes('reel') || listaNombre.includes('video')) {
      tipoKey = 'reels';
    } else if (listaNombre.includes('cm') || listaNombre.includes('community')) {
      tipoKey = 'cm';
    } else {
      tipoKey = 'flyers';
    }

    const cliente = lista.carpetaNombre || lista.folder?.name || lista.name;

    try {
      // Fetch with include_closed to get terminado tasks
      const res = await _getTareasTerminadasMes(lista.id, inicioMes, finMes);
      if (!res.length) continue;

      if (!counts[cliente]) counts[cliente] = { reels: 0, flyers: 0, cm: 0 };
      counts[cliente][tipoKey] += res.length;
    } catch (err) {
      console.error(`[CierreMensual] Error list ${lista.id}:`, err.message);
    }
  }

  // Build report
  const clientesOrdenados = Object.keys(counts).sort();
  let total = 0;
  const lineas = [];

  for (const cliente of clientesOrdenados) {
    const c = counts[cliente];
    const partes = [];
    if (c.reels)  partes.push(`${c.reels} reel${c.reels !== 1 ? 's' : ''}`);
    if (c.flyers) partes.push(`${c.flyers} flyer${c.flyers !== 1 ? 's' : ''}`);
    if (c.cm)     partes.push(`${c.cm} CM`);
    const subtotal = c.reels + c.flyers + c.cm;
    total += subtotal;
    lineas.push(`• ${cliente}: ${partes.join(', ')}`);
  }

  if (!lineas.length) {
    enviarANumero(adminNumero, `No encontré tareas terminadas en ${MESES_ES[mes]} ${anio}.`);
    return;
  }

  // Write to Google Sheets — failures don't block the WhatsApp report
  const mesNombre = `${capitalizar(MESES_ES[mes])} ${anio}`;
  const filasPorCliente = clientesOrdenados.map(cliente => ({
    cliente,
    videosComplejos: 0,
    videosSimples: counts[cliente].reels,
    flyersComplejos: 0,
    flyersSimples: counts[cliente].flyers,
    jornadasProduccion: 0,
  }));

  let sheetOk = false;
  try {
    await escribirProduccionMensual(mesNombre, filasPorCliente);
    sheetOk = true;
  } catch (err) {
    console.error('[CierreMensual] Error escribiendo en Google Sheets:', err.message);
  }

  const reporte =
    `📊 Cierre ${capitalizar(MESES_ES[mes])} ${anio}: piezas terminadas\n\n` +
    lineas.join('\n') +
    `\n\nTotal: ${total} pieza${total !== 1 ? 's' : ''}\n(Costos pendientes de definir)` +
    (sheetOk ? '\n📊 Datos guardados en hoja PRODUCCION_MENSUAL del sheet.' : '');

  // Send to admin
  enviarANumero(adminNumero, reporte);

  // Send to group if configured
  const grupoId = process.env.GRUPO_ID;
  if (grupoId) {
    const { enviarTexto } = require('../whatsapp/whapi');
    try {
      await enviarTexto(grupoId, reporte);
    } catch (err) {
      console.error('[CierreMensual] Error enviando al grupo:', err.message);
    }
  }

  console.log(`[CierreMensual] Reporte de ${MESES_ES[mes]} enviado. Total: ${total} piezas.`);
}

/**
 * Fetch tasks from a list that are in 'terminado' status and were
 * updated/closed within the given month range.
 */
async function _getTareasTerminadasMes(listaId, inicioMes, finMes) {
  const ESTADOS_TERMINADO = ['terminado', 'done', 'complete', 'closed'];
  const terminadas = [];

  // getTareasPorLista uses include_closed: false, so 'terminado' tasks that
  // ClickUp hasn't archived yet are still returned as active tasks with that status.
  let page = 0;
  while (true) {
    const res = await getTareasPorLista(listaId, page);
    const batch = res.tasks || [];
    for (const t of batch) {
      const estado = t.status?.status?.toLowerCase() || '';
      if (!ESTADOS_TERMINADO.includes(estado)) continue;
      // Check date_updated falls within month
      const updated = t.date_updated ? parseInt(t.date_updated) : 0;
      const done    = t.date_done   ? parseInt(t.date_done)    : 0;
      const refDate = done || updated;
      if (refDate >= inicioMes && refDate <= finMes) {
        terminadas.push(t);
      }
    }
    if (!res.last_page && batch.length === 100) {
      page++;
    } else {
      break;
    }
  }
  return terminadas;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalizar(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  // Pending ops API
  setPendingOp,
  getPendingOp,
  clearPendingOp,
  // Skill #1
  manejarClickupConversacional,
  ejecutarOpPendiente,
  // Skill #2
  manejarBatchPiezas,
  ejecutarBatchPendiente,
  // Skill #5
  ejecutarCierreMensual,
};
