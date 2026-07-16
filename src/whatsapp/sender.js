const { getSock, estaConectado } = require('./client');

const cola = [];
let procesando = false;
const DELAY_MS = 2500;
const MAX_REINTENTOS = 3;

const PROVIDER = () => process.env.WHATSAPP_PROVIDER || 'baileys';
const esWhapi = () => PROVIDER() === 'whapi';

function jidDeNumero(numero) {
  const limpio = numero.replace(/\D/g, '');
  return `${limpio}@s.whatsapp.net`;
}

// Envío según proveedor. Whapi acepta número o grupo (xxx@g.us).
async function enviarPorProveedor(jid, texto) {
  if (esWhapi()) {
    const { enviarTexto } = require('./whapi');
    await enviarTexto(jid, texto);
  } else {
    await getSock().sendMessage(jid, { text: texto });
  }
}

function encolar(jid, texto) {
  cola.push({ jid, texto, intentos: 0 });
  if (!procesando) procesarCola();
}

function enviarANumero(numero, texto) {
  encolar(jidDeNumero(numero), texto);
}

async function procesarCola() {
  procesando = true;
  while (cola.length > 0) {
    const item = cola[0];

    // Baileys: esperar a estar conectado. Whapi: es REST, siempre disponible.
    if (!esWhapi() && !estaConectado()) {
      console.log('[Sender] Esperando reconexión de WhatsApp...');
      await esperar(5000);
      continue;
    }

    cola.shift();

    try {
      await enviarPorProveedor(item.jid, item.texto);
      console.log(`[Sender] ✅ Enviado a ${item.jid} (intento ${item.intentos + 1})`);
    } catch (err) {
      console.error(`[Sender] ❌ Error enviando a ${item.jid} (intento ${item.intentos + 1}):`, err.message);

      // Reintentar hasta MAX_REINTENTOS veces
      if (item.intentos < MAX_REINTENTOS) {
        item.intentos++;
        cola.unshift(item); // Volver al frente de la cola
        await esperar(3000);
        continue;
      } else {
        console.error(`[Sender] ⛔ Descartando mensaje a ${item.jid} después de ${MAX_REINTENTOS} intentos`);
      }
    }

    await esperar(DELAY_MS);
  }
  procesando = false;
}

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { encolar, enviarANumero, jidDeNumero };
