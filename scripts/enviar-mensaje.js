require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SESSION_DIR = path.join(__dirname, '..', 'session');
const QR_FILE = path.join(require('os').homedir(), 'Desktop', 'friday-qr.html');

const NUMERO = '5493812019292';
const MENSAJE = `Galo, te paso el estado de tus tareas al dia de hoy. Hay situaciones que requieren atencion inmediata.

🚨 *ATRASADAS — requieren cierre hoy*
• *Reel Kove 800 (polémico)* — CentroMotoVM ⚠️ URGENTE (10 dias de atraso)
• *Reel Kove 800 (técnico)* — CentroMotoVM (10 dias de atraso)
• *Emiliano ENDURO vozz en off* — Gas Gas (7 dias de atraso)
• *0.1 Corolla Blanco* — Grosso Automotores (2 dias de atraso)

📅 *VENCEN HOY*
• *0.2 Corolla negro* — Grosso Automotores
• *0.3 Toyota general* — Grosso Automotores
• *0.4 Toyota Etios* — Grosso Automotores
• *0.5 Nissan* — Grosso Automotores
• *0.6 Oferta* — Grosso Automotores
• *0.7 Mario* — Grosso Automotores
• *0.1 110 Stock* 🔴 — CentroMotoVM
• *0.2 Scooter* — CentroMotoVM
• *0.3 Bajaj* — CentroMotoVM
• *0.4 Suzuki* — CentroMotoVM
• *BLITZ 110 FULL vs BLITZ 110 FULL ONE* 🔴 — MOTOMEL

🔜 *PROXIMAS*
• *SKUA 125 XTREME* — MOTOMEL — Jueves 3/7

Son 16 tareas en total. Las 4 atrasadas necesitan resolverse hoy sin excepcion. Si hay algun bloqueo, avisame ahora mismo.`;

let enviado = false;

async function run() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();
  console.log('WA version:', version.join('.'));

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { width: 500, margin: 2 });
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>FRIDAY QR</title><meta http-equiv="refresh" content="25">
<style>*{margin:0;padding:0;box-sizing:border-box;}
body{background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:20px;font-family:-apple-system,sans-serif;}
h2{color:#fff;font-size:20px;}img{border-radius:12px;}
p{color:#999;font-size:13px;text-align:center;}</style></head>
<body>
<h2>Escaneá con WhatsApp</h2>
<img src="${dataUrl}" width="400" height="400"/>
<p>WhatsApp → Menú → Dispositivos vinculados → Vincular dispositivo</p>
<p>El QR se renueva automáticamente</p>
</body></html>`;
        fs.writeFileSync(QR_FILE, html);
        exec(`open "${QR_FILE}"`);
        console.log(`\nQR guardado en el Desktop (friday-qr.html) y abierto en el browser.`);
        console.log('Escaneá el QR con WhatsApp para conectar.');
      } catch (e) {
        console.error('Error con QR:', e.message);
      }
    }

    if (connection === 'open' && !enviado) {
      enviado = true;
      console.log('\n✅ Conectado! Enviando mensaje a Galo...');
      try {
        await sock.sendMessage(`${NUMERO}@s.whatsapp.net`, { text: MENSAJE });
        console.log('✅ Mensaje enviado correctamente. Cerrando en 3s...');
      } catch (e) {
        console.error('Error enviando:', e.message);
      }
      setTimeout(() => { sock.end(); process.exit(0); }, 3000);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode : 0;
      console.log(`Conexión cerrada (código: ${code})`);
      if (!enviado) {
        console.log('Reconectando en 3s...');
        setTimeout(run, 3000);
      }
    }
  });
}

console.log('Iniciando FRIDAY sender...');
run().catch(console.error);
