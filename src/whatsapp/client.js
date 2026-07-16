const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(process.cwd(), 'session');

let sock = null;
let isConnected = false;
let onMessageHandler = null;
let reconectando = false;
let ultimoQR = null;          // último QR string, para el endpoint web /qr
let ultimoPairingCode = null; // código de vinculación por número (más confiable)

async function conectar(onMessage) {
  if (onMessage) onMessageHandler = onMessage;
  if (reconectando) return;
  reconectando = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      keepAliveIntervalMs: 30000,       // Ping cada 30s para mantener conexión
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 2000,
      qrTimeout: 180000,                // QR válido 3 min por ciclo (menos parpadeo)
    });

    sock.ev.on('creds.update', saveCreds);

    // ── Código de vinculación por número (más confiable que el QR) ──
    // Se pide una sola vez si la sesión no está registrada. El usuario lo ingresa
    // en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.
    const numeroFriday = (process.env.FRIDAY_NUMBER || '').replace(/\D/g, '');
    if (numeroFriday && process.env.WHATSAPP_PAIRING !== 'off' && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          if (sock.authState.creds.registered) return;
          const code = await sock.requestPairingCode(numeroFriday);
          ultimoPairingCode = code;
          console.log(`[FRIDAY] 🔑 Código de vinculación: ${code}`);
          console.log('[FRIDAY]    WhatsApp → Dispositivos vinculados → Vincular con número de teléfono');
        } catch (err) {
          console.error('[FRIDAY] Error pidiendo código de vinculación:', err.message);
        }
      }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        ultimoQR = qr; // guardar para el endpoint web /qr
        console.log('\n[FRIDAY] Escaneá el QR: abrí /qr en el navegador (o el QR de abajo):');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        isConnected = false;
        reconectando = false;
        const codigo = lastDisconnect?.error?.output?.statusCode;
        console.log(`[WhatsApp] Conexión cerrada (código ${codigo})`);

        if (codigo === DisconnectReason.loggedOut) {
          // 401 = sesión inválida/deslogueada. Reconectar SIN borrar loopea para
          // siempre con credenciales muertas. Hay que limpiar la sesión para que
          // Baileys genere un QR nuevo y se pueda re-vincular.
          console.log('[WhatsApp] Código 401 (logout). Limpiando sesión y regenerando QR...');
          limpiarSession();
          ultimoQR = null;
          setTimeout(() => conectar(onMessageHandler), 3000);
        } else if (codigo === DisconnectReason.restartRequired) {
          console.log('[WhatsApp] Reinicio requerido. Reconectando...');
          setTimeout(() => conectar(onMessageHandler), 2000);
        } else {
          // Cualquier otro error — reconectar con backoff
          const delay = 5000 + Math.random() * 5000;
          console.log(`[WhatsApp] Reconectando en ${Math.round(delay / 1000)}s...`);
          setTimeout(() => conectar(onMessageHandler), delay);
        }
      }

      if (connection === 'open') {
        isConnected = true;
        reconectando = false;
        ultimoQR = null;
        ultimoPairingCode = null; // ya conectado
        console.log('[FRIDAY] ✅ WhatsApp conectado');
      }
    });

    if (onMessageHandler) {
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          const jid = msg.key.remoteJid;
          // Log grupos para capturar GRUPO_GENERAL_ID
          if (jid?.includes('@g.us')) {
            console.log(`[Group] Mensaje de grupo recibido. JID: ${jid}`);
          }
          onMessageHandler(msg);
        }
      });
    }

  } catch (err) {
    reconectando = false;
    console.error('[WhatsApp] Error al conectar:', err.message);
    setTimeout(() => conectar(onMessageHandler), 10000);
  }

  return sock;
}

function limpiarSession() {
  try {
    const archivos = fs.readdirSync(SESSION_DIR);
    for (const archivo of archivos) {
      // Preservar state.json (estado propio de FRIDAY) y saltar directorios
      // como lost+found (que crea el volumen de Railway).
      if (archivo === 'state.json' || archivo === 'lost+found') continue;
      const full = path.join(SESSION_DIR, archivo);
      try {
        if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
        else fs.unlinkSync(full);
      } catch (e) { /* ignorar entradas que no se pueden borrar */ }
    }
    console.log('[WhatsApp] Sesión limpiada');
  } catch (err) {
    console.error('[WhatsApp] Error limpiando sesión:', err.message);
  }
}

function getSock() {
  return sock;
}

function estaConectado() {
  return isConnected;
}

function getQR() {
  return ultimoQR;
}

function getPairingCode() {
  return ultimoPairingCode;
}

async function cierreGraceful() {
  console.log('[WhatsApp] Cerrando conexión gracefully...');
  isConnected = false;
  reconectando = false;
  if (sock) {
    try {
      sock.end(); // Cierra el WebSocket sin invalidar la sesión en WhatsApp
    } catch (e) {}
  }
  await new Promise(r => setTimeout(r, 1500));
  console.log('[WhatsApp] Conexión cerrada correctamente');
}

module.exports = { conectar, getSock, estaConectado, getQR, getPairingCode, cierreGraceful };
