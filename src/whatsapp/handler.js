// Fase 3 — handler de mensajes reactivos
// Por ahora solo loguea mensajes entrantes de números autorizados

const { getColaborador } = require('../sheets/colaboradores');
const { enviarANumero } = require('./sender');

const NUMEROS_ADMIN = (process.env.WHATSAPP_AUTHORIZED_NUMBERS || '').split(',').map(n => n.trim());

async function manejarMensaje(msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid) return;

    // Extraer número
    const numero = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const esGrupo = jid.includes('@g.us');

    if (esGrupo) return; // En Fase 1 ignoramos grupos

    // Verificar si está autorizado
    const colaborador = await getColaborador(numero);
    const esAdmin = NUMEROS_ADMIN.includes(numero);

    if (!colaborador && !esAdmin) return; // Número no autorizado, silencio total

    const texto = msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text ||
                  '';

    if (!texto.trim()) return;

    console.log(`[Handler] Mensaje de ${colaborador?.nombre || numero}: "${texto.substring(0, 50)}"`);

    // Fase 3: acá se conectará Claude. Por ahora respuesta placeholder.
    enviarANumero(numero, `Hola ${colaborador?.nombre || 'there'} — el modo conversacional estará disponible pronto. 🤖`);

  } catch (err) {
    console.error('[Handler] Error procesando mensaje:', err.message);
  }
}

module.exports = { manejarMensaje };
