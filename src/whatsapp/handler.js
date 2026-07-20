const { getColaborador } = require('../sheets/colaboradores');
const { getTareasTodos, clasificarTareasParaColaborador, estaTerminada } = require('../clickup/tasks');
const { completarTarea } = require('../clickup/actions');
const { generarConHistorial } = require('../brain/claude');
const { buildSystemPromptConversacion } = require('../brain/context');
const { agregarMensaje, getHistorial } = require('../brain/memory');
const { setPendiente, getPendiente, limpiarPendiente, esConfirmacion, esNegacion } = require('../brain/confirmations');
const { getDatosJarvis } = require('../sheets/jarvis');
const { enviarANumero } = require('./sender');
const { construirReporteDiario } = require('../reports/daily');
const { getColaboradores } = require('../sheets/colaboradores');
const {
  getPendingOp, clearPendingOp,
  manejarClickupConversacional, ejecutarOpPendiente,
  manejarBatchPiezas, ejecutarBatchPendiente,
  ejecutarCierreMensual,
} = require('../brain/clickup-skills');

const NUMEROS_AUTORIZADOS = () =>
  (process.env.WHATSAPP_AUTHORIZED_NUMBERS || '').split(',').map(n => n.trim());

const KEYWORDS_COMPLETADO = ['listo', 'ya lo hice', 'terminé', 'termine', 'completado', 'lo hice', 'hecho', 'lo terminé', 'lo termine', 'ya termine', 'ya terminé', 'lo termine', 'ya lo termine'];
const KEYWORDS_INTERMEDIO = ['lo hago mañana', 'lo hago manana', 'estoy en eso', 'en progreso', 'mañana lo hago', 'lo veo después', 'lo veo despues'];

function detectarIntencion(texto) {
  const lower = texto.toLowerCase();
  if (KEYWORDS_INTERMEDIO.some(k => lower.includes(k))) return 'intermedio';
  if (KEYWORDS_COMPLETADO.some(k => lower.includes(k))) return 'posible_completado';
  return 'consulta';
}

function extraerTexto(msg) {
  return msg.message?.conversation ||
         msg.message?.extendedTextMessage?.text ||
         msg.message?.imageMessage?.caption || '';
}

async function manejarMensaje(msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid || jid.includes('@g.us')) return;

    const numero = jid.replace('@s.whatsapp.net', '');
    const texto = extraerTexto(msg).trim();
    if (!texto) return;

    const colaborador = await getColaborador(numero);
    const esAutorizado = colaborador || NUMEROS_AUTORIZADOS().includes(numero);
    if (!esAutorizado) return;

    const perfil = colaborador || {
      nombre: 'Admin',
      rol: 'Admin',
      nivel: 'admin',
      clickupId: null,
    };

    console.log(`[Handler] ${perfil.nombre}: "${texto.substring(0, 60)}"`);

    // ── Comandos admin (solo nivel admin, prefijo !) ───────────────────────
    if (texto.startsWith('!') && perfil.nivel === 'admin') {
      await manejarComandoAdmin(numero, texto.slice(1).trim(), perfil);
      return;
    }

    // ── Skills read-only: auditoría y capacidad (admin/supervisor) ────────
    if (perfil.nivel === 'admin' || perfil.nivel === 'supervisor') {
      if (/\b(audit[aá]|auditar|auditor[ií]a|hay algo (raro|trabado|mal)|revis[aá] el tablero|chequ[eé]a el tablero)\b/i.test(texto)) {
        try {
          const { auditarTablero } = require('../brain/skills');
          const { total, hallazgos } = await auditarTablero();
          if (!hallazgos.length) enviarANumero(numero, `Auditoría OK ✅ — ${total} tareas activas, nada raro.`);
          else enviarANumero(numero, `🔎 Auditoría del tablero (${total} activas):\n\n${hallazgos.join('\n')}\n\nDecime si querés que arregle alguna.`);
        } catch (e) { console.error('[Skill audit]', e.message); enviarANumero(numero, 'No pude auditar el tablero ahora.'); }
        return;
      }
      if (/\b(qui[eé]n est[aá] m[aá]s cargad|capacidad|carga del equipo|qui[eé]n puede tomar|qui[eé]n tiene menos)\b/i.test(texto)) {
        try {
          const { capacidadEquipo } = require('../brain/skills');
          const { orden, atr, sinAsignar, total } = await capacidadEquipo();
          let m = `👥 Carga del equipo (${total} tareas activas):\n\n`;
          m += orden.map(([n, c]) => `• ${n}: ${c}${atr[n] ? ` (${atr[n]} atrasadas)` : ''}`).join('\n');
          if (sinAsignar) m += `\n\n${sinAsignar} sin asignar.`;
          enviarANumero(numero, m);
        } catch (e) { console.error('[Skill capacidad]', e.message); enviarANumero(numero, 'No pude calcular la carga ahora.'); }
        return;
      }
    }

    // ── Skills write: ClickUp conversacional y batch (solo admin) ────────
    if (perfil.nivel === 'admin') {
      // Skill #5 — Cierre mensual
      if (/\b(cierre\s+del?\s+mes|cerr[aá]\s+(?:el\s+mes|(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)))\b/i.test(texto)) {
        try {
          await ejecutarCierreMensual(numero);
        } catch (e) { console.error('[Skill cierre]', e.message); enviarANumero(numero, 'No pude generar el cierre mensual ahora.'); }
        return;
      }

      // Skill #2 — Batch (detect BEFORE Skill #1 to catch multi-type messages)
      try {
        const batchHandled = await manejarBatchPiezas(numero, texto);
        if (batchHandled) return;
      } catch (e) { console.error('[Skill batch]', e.message); }

      // Skill #1 — ClickUp conversacional (single op: crear/mover/reasignar)
      try {
        const clickupHandled = await manejarClickupConversacional(numero, texto);
        if (clickupHandled) return;
      } catch (e) { console.error('[Skill clickup]', e.message); }
    }

    // ── FASE 4: Manejo de confirmación pendiente ──────────────────────────
    // Check ClickUp op confirmations first (admin only)
    if (perfil.nivel === 'admin') {
      const opPendiente = getPendingOp(numero);
      if (opPendiente) {
        if (esConfirmacion(texto)) {
          // Dispatch to the right executor based on accion
          if (opPendiente.accion === 'batch_crear') {
            await ejecutarBatchPendiente(numero);
          } else {
            await ejecutarOpPendiente(numero);
          }
          return;
        }
        if (esNegacion(texto)) {
          clearPendingOp(numero);
          enviarANumero(numero, 'Ok, cancelado.');
          return;
        }
        // Message is not yes/no — clear op and continue to normal flow
        clearPendingOp(numero);
      }
    }

    const pendiente = getPendiente(numero);

    if (pendiente) {
      if (esConfirmacion(texto)) {
        try {
          await completarTarea(pendiente.taskId);
          enviarANumero(numero, `✅ Pasé *${pendiente.taskName}* a Revisión. Espera la aprobación.`);
          // Notify all admins
          const admins = await getColaboradores();
          for (const [adminNum, adminData] of admins) {
            if (adminData.nivel === 'admin' && adminNum !== numero) {
              enviarANumero(adminNum, `🔔 *Nueva pieza para revisar*\n\nTarea: *${pendiente.taskName}*\nEntregó: ${perfil.nombre || numero}\n\nEstá lista para revisión en ClickUp.`);
            }
          }
          console.log(`[Handler] Tarea completada en ClickUp: ${pendiente.taskName}`);
        } catch (err) {
          console.error('[Handler] Error marcando tarea:', err.message);
          enviarANumero(numero, 'Hubo un error al marcar la tarea. Intentá de nuevo.');
        }
        limpiarPendiente(numero);
        return;
      }

      if (esNegacion(texto)) {
        enviarANumero(numero, 'Ok, no la toqué.');
        limpiarPendiente(numero);
        return;
      }

      // Si no es si/no, limpiar y seguir con flujo normal
      limpiarPendiente(numero);
    }

    // ── Cargar tareas del colaborador ─────────────────────────────────────
    let tareas = [];
    let todasLasTareas = [];
    try {
      todasLasTareas = await getTareasTodos();
      if (perfil.clickupId) {
        if (perfil.nivel === 'admin' || perfil.nivel === 'supervisor') {
          tareas = todasLasTareas.slice(0, 60);
        } else {
          const { atrasadas, paraHoy, proximamente } = clasificarTareasParaColaborador(
            todasLasTareas, perfil.clickupId
          );
          tareas = [...atrasadas, ...paraHoy, ...proximamente];
        }
      }
    } catch (err) {
      console.error('[Handler] Error cargando tareas:', err.message);
    }

    // ── FASE 4: Detección de completado ───────────────────────────────────
    const intencion = detectarIntencion(texto);

    if (intencion === 'posible_completado' && perfil.clickupId) {
      const tareasActivas = tareas.filter(t =>
        !estaTerminada(t) && t.asignados.some(a => a.id === String(perfil.clickupId))
      );

      if (tareasActivas.length === 1) {
        // Una sola tarea activa → pedir confirmación directamente
        setPendiente(numero, tareasActivas[0].id, tareasActivas[0].nombre);
        enviarANumero(numero, `¿Terminaste *${tareasActivas[0].nombre}*? La voy a pasar a Revisión para que la aprueben. (sí / no)`);
        return;
      }
      // Más de una o ninguna → Claude pregunta "Que cosa ya hiciste?"
    }

    if (intencion === 'intermedio') {
      // Registrar pero no tocar ClickUp — Claude maneja la respuesta
    }

    // ── FASE 3: Respuesta con Claude ──────────────────────────────────────
    let datosJarvis = null;
    if (perfil.nivel === 'admin') {
      try { datosJarvis = await getDatosJarvis(); } catch (_) {}
    }
    const systemPrompt = buildSystemPromptConversacion(perfil, tareas, datosJarvis);
    agregarMensaje(numero, 'user', texto);
    const historial = getHistorial(numero);

    let respuesta = '';
    try {
      respuesta = await generarConHistorial(systemPrompt, historial, 1024);
    } catch (err) {
      console.error('[Handler] Error Claude:', err.message);
      respuesta = 'Tuve un problema técnico. Intentá de nuevo en un momento.';
    }

    agregarMensaje(numero, 'assistant', respuesta);
    enviarANumero(numero, respuesta);

  } catch (err) {
    console.error('[Handler] Error general:', err.message);
  }
}

async function manejarComandoAdmin(numeroAdmin, comando, perfil) {
  const args = comando.toLowerCase().split(' ');
  const cmd = args[0];

  // !recordatorio <nombre> — envía reporte de tareas a ese colaborador
  if (cmd === 'recordatorio' || cmd === 'reporte') {
    const nombre = args.slice(1).join(' ');
    if (!nombre) {
      enviarANumero(numeroAdmin, 'Uso: !recordatorio <nombre>\nEjemplo: !recordatorio galo');
      return;
    }
    const colaboradores = await getColaboradores();
    const encontrado = [...colaboradores.values()].find(c =>
      c.nombre.toLowerCase().includes(nombre)
    );
    if (!encontrado) {
      enviarANumero(numeroAdmin, `No encontré colaborador con nombre "${nombre}".`);
      return;
    }
    const todasLasTareas = await getTareasTodos();
    const reporte = await construirReporteDiario(encontrado, todasLasTareas);
    if (reporte) {
      const numeroColab = [...colaboradores.entries()]
        .find(([, c]) => c.nombre === encontrado.nombre)?.[0];
      if (numeroColab) {
        enviarANumero(numeroColab, reporte);
        enviarANumero(numeroAdmin, `Reporte enviado a ${encontrado.nombre} ✅`);
      }
    } else {
      enviarANumero(numeroAdmin, `${encontrado.nombre} no tiene tareas activas.`);
    }
    return;
  }

  // !estado — resumen del sistema
  if (cmd === 'estado') {
    const { estaConectado } = require('./client');
    const colaboradores = await getColaboradores();
    const msg = `FRIDAY · Estado del sistema\n\n` +
      `WhatsApp: ${estaConectado() ? '✅ Conectado' : '❌ Desconectado'}\n` +
      `Colaboradores cargados: ${colaboradores.size}\n` +
      `Hora servidor: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}\n\n` +
      `Comandos disponibles:\n` +
      `• !recordatorio <nombre>\n` +
      `• !estado`;
    enviarANumero(numeroAdmin, msg);
    return;
  }

  enviarANumero(numeroAdmin, `Comando no reconocido: !${cmd}\n\nComandos disponibles:\n• !recordatorio <nombre>\n• !estado`);
}

module.exports = { manejarMensaje };
