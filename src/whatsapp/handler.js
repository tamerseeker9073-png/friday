const { getColaborador, getColaboradores } = require('../sheets/colaboradores');
const { getTareasTodos, clasificarTareasParaColaborador } = require('../clickup/tasks');
const { generarConHistorial } = require('../brain/claude');
const { buildSystemPromptConversacion } = require('../brain/context');
const { getNivel } = require('../brain/access');
const { agregarMensaje, getHistorial } = require('../brain/memory');
const { enviarANumero } = require('./sender');

const NUMEROS_AUTORIZADOS = () =>
  (process.env.WHATSAPP_AUTHORIZED_NUMBERS || '').split(',').map(n => n.trim());

// Palabras que indican tarea completada
const KEYWORDS_COMPLETADO = ['listo', 'ya lo hice', 'terminé', 'termine', 'completado', 'lo hice', 'hecho', 'lo terminé', 'lo termine', 'ya termine', 'ya terminé'];
// Palabras intermedias que NO son confirmación de completado
const KEYWORDS_INTERMEDIO = ['lo hago mañana', 'lo hago manana', 'estoy en eso', 'en progreso', 'lo veo después', 'lo veo despues', 'mañana', 'manana'];

function detectarIntencion(texto) {
  const lower = texto.toLowerCase();
  if (KEYWORDS_INTERMEDIO.some(k => lower.includes(k))) return 'intermedio';
  if (KEYWORDS_COMPLETADO.some(k => lower.includes(k))) return 'posible_completado';
  return 'consulta';
}

function extraerTexto(msg) {
  return msg.message?.conversation ||
         msg.message?.extendedTextMessage?.text ||
         msg.message?.imageMessage?.caption ||
         '';
}

async function manejarMensaje(msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid || jid.includes('@g.us')) return; // Ignorar grupos por ahora

    const numero = jid.replace('@s.whatsapp.net', '');
    const texto = extraerTexto(msg).trim();
    if (!texto) return;

    // Verificar autorización
    const colaborador = await getColaborador(numero);
    const esAutorizado = colaborador || NUMEROS_AUTORIZADOS().includes(numero);
    if (!esAutorizado) return;

    // Si no está en el sheet pero sí en AUTHORIZED_NUMBERS, crear perfil mínimo
    const perfil = colaborador || {
      nombre: 'Usuario',
      rol: 'Admin',
      nivel: 'admin',
      clickupId: process.env.PATO_NUMBER?.replace(/\D/g, '') === numero ? '105983083' : null,
    };

    console.log(`[Handler] ${perfil.nombre} (${perfil.nivel}): "${texto.substring(0, 60)}"`);

    const intencion = detectarIntencion(texto);

    // Tareas del colaborador para contexto
    let tareas = [];
    try {
      const todasLasTareas = await getTareasTodos();
      if (perfil.clickupId) {
        const { atrasadas, paraHoy, proximamente } = clasificarTareasParaColaborador(
          todasLasTareas, perfil.clickupId
        );
        tareas = [...atrasadas, ...paraHoy, ...proximamente];

        // Admins y supervisores ven todas las tareas
        if (perfil.nivel === 'admin' || perfil.nivel === 'supervisor') {
          tareas = todasLasTareas.slice(0, 50);
        }
      }
    } catch (err) {
      console.error('[Handler] Error cargando tareas:', err.message);
    }

    const systemPrompt = buildSystemPromptConversacion(perfil, tareas);

    // Agregar mensaje al historial
    agregarMensaje(numero, 'user', texto);
    const historial = getHistorial(numero);

    // Generar respuesta con Claude
    let respuesta = '';
    try {
      respuesta = await generarConHistorial(systemPrompt, historial, 1024);
    } catch (err) {
      console.error('[Handler] Error Claude:', err.message);
      respuesta = 'Tuve un problema técnico. Intentá de nuevo en un momento.';
    }

    // Guardar respuesta en historial
    agregarMensaje(numero, 'assistant', respuesta);

    enviarANumero(numero, respuesta);

  } catch (err) {
    console.error('[Handler] Error general:', err.message);
  }
}

module.exports = { manejarMensaje };
