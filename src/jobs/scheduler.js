const cron = require('node-cron');
const { getColaboradores } = require('../sheets/colaboradores');
const { getTareasTodos } = require('../clickup/tasks');
const { construirReporteDiario } = require('../reports/daily');
const { construirReporteSemanal } = require('../reports/weekly');
const { enviarReporteQuincenal } = require('../reports/biweekly');
const { verificarEscalaciones } = require('../alerts/escalation');
const { iniciarPolling } = require('../alerts/realtime');
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
        console.error(`[Scheduler] Error en reporte de ${colaborador.nombre}:`, err.message);
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
    const todasLasTareas = await getTareasTodos();

    for (const [numero, colaborador] of colaboradores) {
      if (reporteYaEnviado(numero, 'weekly')) continue;
      try {
        const reporte = await construirReporteSemanal(colaborador, todasLasTareas);
        if (!reporte) continue;
        enviarANumero(numero, reporte);
        marcarReporteEnviado(numero, 'weekly');
        console.log(`[Scheduler] Reporte semanal encolado para ${colaborador.nombre}`);
      } catch (err) {
        console.error(`[Scheduler] Error semanal de ${colaborador.nombre}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error en reportes semanales:', err.message);
  }
}

function iniciarJobs() {
  // Reporte diario — 9:00 AM todos los días
  cron.schedule('0 9 * * *', enviarReportesDiarios, { timezone: TZ });

  // Escalaciones — 10:00 AM todos los días (después del reporte)
  cron.schedule('0 10 * * *', verificarEscalaciones, { timezone: TZ });

  // Reporte semanal — viernes 17:00
  cron.schedule('0 17 * * 5', enviarReportesSemanales, { timezone: TZ });

  // Reporte quincenal — día 1 y 16 de cada mes a las 10AM
  cron.schedule('0 10 1,16 * *', enviarReporteQuincenal, { timezone: TZ });

  // Limpieza de estado viejo — domingos a medianoche
  cron.schedule('0 0 * * 0', limpiarAlertasViejas, { timezone: TZ });

  // Alertas en tiempo real — polling cada 3 minutos
  iniciarPolling();

  console.log('[Scheduler] Jobs iniciados: diario 9AM, escalaciones 10AM, semanal viernes 17hs, quincenal días 1 y 16');
}

// numeroTest: número al que llega el mensaje
// numeroColaborador: número del colaborador cuyo reporte se genera (opcional)
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
