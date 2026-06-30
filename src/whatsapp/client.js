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

const SESSION_DIR = path.join(process.cwd(), 'session');

let sock = null;
let isConnected = false;

async function conectar(onMessage) {
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
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const debeReconectar = codigo !== DisconnectReason.loggedOut;

      console.log(`[WhatsApp] Conexión cerrada (código ${codigo}). Reconectar: ${debeReconectar}`);

      if (debeReconectar) {
        setTimeout(() => conectar(onMessage), 5000);
      } else {
        console.error('[WhatsApp] Sesión cerrada. Borrá la carpeta session/ y reiniciá para escanear el QR de nuevo.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      isConnected = true;
      console.log('[FRIDAY] ✅ WhatsApp conectado');
    }
  });

  if (onMessage) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        onMessage(msg);
      }
    });
  }

  return sock;
}

function getSock() {
  return sock;
}

function estaConectado() {
  return isConnected;
}

module.exports = { conectar, getSock, estaConectado };
