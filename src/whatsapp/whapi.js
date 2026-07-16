// Transporte WhatsApp vía Whapi.cloud (API gestionada, soporta grupos).
// Se activa con WHATSAPP_PROVIDER=whapi. Reemplaza a Baileys sin tocar la lógica.
//
// Env:
//   WHAPI_TOKEN   token Bearer del channel de Whapi.cloud
// Opcional:
//   WHAPI_BASE    default https://gate.whapi.cloud

const axios = require('axios');

const BASE = () => process.env.WHAPI_BASE || 'https://gate.whapi.cloud';

// Grupo (xxx@g.us) se manda tal cual; 1:1 va como número (solo dígitos).
function destinoWhapi(jidONumero) {
  const s = String(jidONumero || '');
  if (s.includes('@g.us')) return s;                 // grupo
  return s.replace('@s.whatsapp.net', '').replace(/\D/g, ''); // 1:1
}

async function enviarTexto(jidONumero, texto) {
  const token = process.env.WHAPI_TOKEN;
  if (!token) throw new Error('Falta WHAPI_TOKEN');
  const to = destinoWhapi(jidONumero);
  await axios.post(`${BASE()}/messages/text`, { to, body: texto }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
}

// Verifica el estado del channel (health) al arrancar.
async function estadoChannel() {
  const token = process.env.WHAPI_TOKEN;
  if (!token) throw new Error('Falta WHAPI_TOKEN');
  const res = await axios.get(`${BASE()}/health`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return res.data; // { status: { text: 'AUTH'|'QR'|... } }
}

// Parsea el webhook entrante de Whapi a mensajes {from, chatId, texto, fromName}.
function parsearWebhookWhapi(body) {
  const out = [];
  for (const m of (body?.messages || [])) {
    if (m.from_me) continue;
    if (m.type !== 'text') continue;
    out.push({
      from:     m.from,           // número del remitente
      chatId:   m.chat_id,        // xxx@s.whatsapp.net o xxx@g.us
      texto:    m.text?.body || '',
      fromName: m.from_name || '',
    });
  }
  return out;
}

module.exports = { enviarTexto, estadoChannel, parsearWebhookWhapi, destinoWhapi };
