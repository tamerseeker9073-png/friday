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
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n[FRIDAY] Escaneá este QR con WhatsApp:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        isConnected = false;
        reconectando = false;
        const codigo = lastDisconnect?.error?.output?.statusCode;
        console.log(`[WhatsApp] Conexión cerrada (código ${codigo})`);

        if (codigo === DisconnectReason.loggedOut) {
          // NO borrar la sesión automáticamente — solo reconectar
          // Baileys mostrará QR si la sesión realmente es inválida
          console.log('[WhatsApp] Código 401 recibido. Reconectando sin borrar sesión...');
          setTimeout(() => conectar(onMessageHandler), 5000);
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
      if (archivo !== 'state.json') { // Preservar el estado de FRIDAY
        fs.unlinkSync(path.join(SESSION_DIR, archivo));
      }
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

module.exports = { conectar, getSock, estaConectado };
