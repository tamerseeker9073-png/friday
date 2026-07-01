const { getTareasTodos, clasificarTareasParaColaborador } = require('../clickup/tasks');
const { getColaboradores } = require('../sheets/colaboradores');
const { alertaYaEnviada, marcarAlertaEnviada } = require('../state/manager');
const { enviarANumero } = require('../whatsapp/sender');
const { calcularDemora, formatearFecha } = require('../utils/dates');
const { emojiDemora } = require('../utils/dates');

const ACUNA_NUMBER = () => process.env.ACUNA_NUMBER;
const PATO_NUMBER = () => process.env.PATO_NUMBER;

function mensajeCordial(colaborador, tarea, dias) {
  return `Hola ${colaborador.nombre}, recordatorio sobre esta tarea:\n\n` +
         `${emojiDemora(dias)} *${tarea.nombre}*\n` +
         `Cliente: ${tarea.cliente}\n` +
         `Lleva ${dias} días de atraso.\n\n` +
         `Si ya la terminaste, avisame y la marco como completada. Si está en progreso, sumale foco hoy.`;
}

function mensajeFirme(colaborador, tarea, dias) {
  return `${colaborador.nombre}, esta tarea lleva ${dias} días sin cerrarse:\n\n` +
         `${emojiDemora(dias)} *${tarea.nombre}*\n` +
         `Cliente: ${tarea.cliente}\n` +
         `Fecha límite: ${formatearFecha(tarea.fechaLimite)}\n\n` +
         `Necesita resolución hoy. Si hay algún bloqueo, avisale a Acuña o Pato.`;
}

async function verificarEscalaciones() {
  console.log('[Escalation] Verificando atrasos...');
  try {
    const colaboradores = await getColaboradores();
    const todasLasTareas = await getTareasTodos();

    // Recopilar atrasos de colaboradores de Acuña (nivel colaborador)
    const atrasadosPorAcuna = [];

    for (const [numero, colaborador] of colaboradores) {
      if (!colaborador.clickupId) continue;

      const { atrasadas } = clasificarTareasParaColaborador(todasLasTareas, colaborador.clickupId);

      for (const tarea of atrasadas) {
        const dias = calcularDemora(tarea.fechaLimite);
        if (!dias || dias < 5) continue;

        if (dias >= 10) {
          // Aviso firme al colaborador
          if (!alertaYaEnviada(tarea.id, 'escalacion-10')) {
            enviarANumero(numero, mensajeFirme(colaborador, tarea, dias));
            marcarAlertaEnviada(tarea.id, 'escalacion-10');
            console.log(`[Escalation] Firme (${dias}d) "${tarea.nombre}" → ${numero}`);
          }
        } else if (dias >= 5) {
          // Aviso cordial al colaborador
          if (!alertaYaEnviada(tarea.id, 'escalacion-5')) {
            enviarANumero(numero, mensajeCordial(colaborador, tarea, dias));
            marcarAlertaEnviada(tarea.id, 'escalacion-5');
            console.log(`[Escalation] Cordial (${dias}d) "${tarea.nombre}" → ${numero}`);
          }
        }

        // Si es colaborador (no admin/supervisor), agregar al resumen de Acuña
        if (colaborador.nivel === 'colaborador' && dias >= 5) {
          atrasadosPorAcuna.push({ colaborador, tarea, dias });
        }
      }
    }

    // Resumen consolidado a Acuña
    if (atrasadosPorAcuna.length > 0) {
      const clave = `acuna-resumen-${new Date().toISOString().split('T')[0]}`;
      if (!alertaYaEnviada(clave, 'resumen')) {
        const porColaborador = {};
        for (const { colaborador, tarea, dias } of atrasadosPorAcuna) {
          if (!porColaborador[colaborador.nombre]) porColaborador[colaborador.nombre] = [];
          porColaborador[colaborador.nombre].push({ tarea, dias });
        }

        let msg = `FRIDAY · Resumen de atrasos del equipo\n\n`;
        for (const [nombre, items] of Object.entries(porColaborador)) {
          msg += `*${nombre}:*\n`;
          for (const { tarea, dias } of items) {
            msg += `  ${emojiDemora(dias)} ${tarea.nombre} — ${dias} días\n`;
          }
          msg += '\n';
        }

        enviarANumero(ACUNA_NUMBER(), msg.trim());
        marcarAlertaEnviada(clave, 'resumen');
        console.log(`[Escalation] Resumen enviado a Acuña (${atrasadosPorAcuna.length} items)`);
      }
    }

  } catch (err) {
    console.error('[Escalation] Error:', err.message);
  }
}

module.exports = { verificarEscalaciones };
