require('dotenv').config();

const { conectar, cierreGraceful } = require('./whatsapp/client');
const { manejarMensaje } = require('./whatsapp/handler');
const { cargarColaboradores } = require('./sheets/colaboradores');
const { iniciarJobs, testReporteDiario } = require('./jobs/scheduler');
const { cargarEstado } = require('./state/manager');
const { iniciarHealthcheck, registrarSender } = require('./healthcheck');
const { enviarANumero } = require('./whatsapp/sender');

const TEST_NUMBER = process.env.TEST_NUMBER;

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════╗');
  console.log('║     FRIDAY — Repanic & Barsante  ║');
  console.log('╚══════════════════════════════════╝');
  console.log('');

  // 1. Health check HTTP (Railway necesita esto para saber que el servicio está vivo)
  iniciarHealthcheck();
  registrarSender(enviarANumero);

  // 2. Cargar estado persistente
  cargarEstado();

  // 2. Cargar colaboradores desde Google Sheets
  console.log('[Init] Cargando colaboradores desde Sheets...');
  try {
    await cargarColaboradores();
  } catch (err) {
    console.error('[Init] ERROR cargando colaboradores:', err.message);
    console.error('[Init] Verificá GOOGLE_CREDENTIALS_JSON y GOOGLE_SHEETS_ID');
    process.exit(1);
  }

  // 3. Conectar WhatsApp
  console.log('[Init] Conectando WhatsApp...');
  await conectar(manejarMensaje);

  // Esperar conexión antes de continuar
  await esperarConexion();

  // 4. Iniciar jobs cron
  iniciarJobs();

  // 5. Test manual si TEST_NUMBER está definido (solo en local/dev)
  if (TEST_NUMBER && process.env.NODE_ENV !== 'production') {
    console.log(`[Init] TEST_NUMBER definido. Enviando reporte de prueba a ${TEST_NUMBER} en 5 segundos...`);
    const TEST_COLAB = process.env.TEST_COLABORADOR_NUMBER;
    setTimeout(() => testReporteDiario(TEST_NUMBER, TEST_COLAB), 5000);
  }

  console.log('[FRIDAY] ✅ Sistema iniciado y listo');
}

function esperarConexion(maxEsperaMs = 120000) {
  const { estaConectado } = require('./whatsapp/client');
  return new Promise((resolve, reject) => {
    if (estaConectado()) return resolve();
    const inicio = Date.now();
    const intervalo = setInterval(() => {
      if (estaConectado()) {
        clearInterval(intervalo);
        resolve();
      } else if (Date.now() - inicio > maxEsperaMs) {
        clearInterval(intervalo);
        // No rechazamos — el QR puede tardar en escanearse
        console.log('[Init] Esperando QR...');
        resolve();
      }
    }, 1000);
  });
}

// Cierre graceful — Railway manda SIGTERM antes de apagar el contenedor
// Esto cierra WhatsApp correctamente para que la próxima sesión reconecte sin QR
process.on('SIGTERM', async () => {
  console.log('[FRIDAY] SIGTERM recibido — cerrando correctamente...');
  await cierreGraceful();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[FRIDAY] SIGINT recibido — cerrando correctamente...');
  await cierreGraceful();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[FRIDAY] Error no capturado:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FRIDAY] Promesa rechazada no manejada:', reason);
});

main().catch((err) => {
  console.error('[FRIDAY] Error fatal en arranque:', err.message);
  process.exit(1);
});
