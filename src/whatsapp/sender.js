const { getSock } = require('./client');

const cola = [];
let procesando = false;
const DELAY_MS = 2500;

function jidDeNumero(numero) {
  const limpio = numero.replace(/\D/g, '');
  return `${limpio}@s.whatsapp.net`;
}

function encolar(jid, texto) {
  cola.push({ jid, texto });
  if (!procesando) procesarCola();
}

function enviarANumero(numero, texto) {
  encolar(jidDeNumero(numero), texto);
}

async function procesarCola() {
  procesando = true;
  while (cola.length > 0) {
    const { jid, texto } = cola.shift();
    try {
      const sock = getSock();
      if (!sock) {
        console.error('[Sender] WhatsApp no está conectado, reencolando...');
        cola.unshift({ jid, texto });
        await esperar(5000);
        continue;
      }
      await sock.sendMessage(jid, { text: texto });
    } catch (err) {
      console.error(`[Sender] Error enviando a ${jid}:`, err.message);
    }
    await esperar(DELAY_MS);
  }
  procesando = false;
}

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { encolar, enviarANumero, jidDeNumero };
