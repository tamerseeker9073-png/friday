const cron = require('node-cron');
const { getColaboradores } = require('../sheets/colaboradores');
const { getTareasTodos } = require('../clickup/tasks');
const { construirReporteDiario } = require('../reports/daily');
const { construirReporteSemanal } = require('../reports/weekly');
const { enviarANumero } = require('../whatsapp/sender');
const { reporteYaEnviado, marcarReporteEnviado, limpiarAlertasViejas } = require('../state/manager');

const TZ = 'America/Argentina/Buenos_Aires';

async function enviarReportesDiarios() {
  console.log('[Scheduler] Iniciando reportes diarios...');
  try {
    const colaboradores = await getColaboradores();
    const todasLasTareas = await getTareasTodos();

    for (const [numero, colaborador] of colaboradores) {
      if (reporteYaEnviado(numero, 'daily')) {
        console.log(`[Scheduler] Reporte diario ya enviado a ${colaborador.nombre}`);
        continue;
      }

      try {
        const reporte = await construirReporteDiario(colaborador, todasLasTareas);
        if (!reporte) continue;

        enviarANumero(numero, reporte);
        marcarReporteEnviado(numero, 'daily');
        console.log(`[Scheduler] Reporte diario encolado para ${colaborador.nombre}`);
      } catch (err) {
        console.error(`[Scheduler] Error construyendo reporte para ${colaborador.nombre}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error en reportes diarios:', err.message);
  }
}

async function enviarReportesSemanales() {
  console.log('[Scheduler] Iniciando reportes semanales...');
  try {
    const colaboradores = await getColaboradores();

    for (const [numero, colaborador] of colaboradores) {
      if (reporteYaEnviado(numero, 'weekly')) continue;

      try {
        const reporte = await construirReporteSemanal(colaborador);
        if (!reporte) continue;

        enviarANumero(numero, reporte);
        marcarReporteEnviado(numero, 'weekly');
        console.log(`[Scheduler] Reporte semanal encolado para ${colaborador.nombre}`);
      } catch (err) {
        console.error(`[Scheduler] Error en reporte semanal de ${colaborador.nombre}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error en reportes semanales:', err.message);
  }
}

function iniciarJobs() {
  // Reporte diario — 9:00 AM todos los días
  cron.schedule('0 9 * * *', enviarReportesDiarios, { timezone: TZ });

  // Reporte semanal — viernes 17:00
  cron.schedule('0 17 * * 5', enviarReportesSemanales, { timezone: TZ });

  // Limpieza de estado viejo — domingos a medianoche
  cron.schedule('0 0 * * 0', limpiarAlertasViejas, { timezone: TZ });

  console.log('[Scheduler] Jobs iniciados (diario 9AM, semanal viernes 17hs)');
}

// Para tests: permite disparar el reporte diario manualmente
// numeroTest: número al que llega el mensaje
// numeroColaborador: número del colaborador cuyo reporte se genera (opcional, default = numeroTest)
async function testReporteDiario(numeroTest, numeroColaborador) {
  const numColab = numeroColaborador || numeroTest;
  console.log(`[Test] Generando reporte de ${numColab} → enviando a ${numeroTest}...`);
  try {
    const colaboradores = await getColaboradores();
    const todasLasTareas = await getTareasTodos();

    let colaboradorTest = colaboradores.get(numColab);

    if (!colaboradorTest) {
      const patoNumero = process.env.PATO_NUMBER?.replace(/\D/g, '');
      colaboradorTest = colaboradores.get(patoNumero) || {
        nombre: 'Test',
        rol: 'Test',
        nivel: 'admin',
        clickupId: null,
      };
    }

    const reporte = await construirReporteDiario(colaboradorTest, todasLasTareas);
    if (reporte) {
      enviarANumero(numeroTest, reporte);
      console.log(`[Test] Reporte de ${colaboradorTest.nombre} enviado a ${numeroTest}`);
    } else {
      console.log(`[Test] No se generó reporte (sin clickupId?)`);
    }
  } catch (err) {
    console.error('[Test] Error:', err.message);
  }
}

module.exports = { iniciarJobs, enviarReportesDiarios, testReporteDiario };
