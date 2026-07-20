const { getTareasTodos, clasificarTareasParaColaborador, estaTerminada } = require('../clickup/tasks');
const { generarTexto } = require('../brain/claude');
const { inicioSemana, finSemana, formatearFecha, fechaEnRango } = require('../utils/dates');
const { separador, formatearTareaAtrasada, formatearTareaSimple } = require('../utils/format');

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

async function construirReporteSemanal(colaborador, todasLasTareas) {
  if (!colaborador.clickupId) return null;

  const desde = inicioSemana();
  const hasta = finSemana();

  const propias = todasLasTareas.filter(t =>
    t.asignados.some(a => a.id === String(colaborador.clickupId))
  );

  const completadasSemana = propias.filter(t =>
    estaTerminada(t) && t.creadaEn && fechaEnRango(t.creadaEn, desde, hasta)
  );

  const { atrasadas, paraHoy, proximamente } = clasificarTareasParaColaborador(todasLasTareas, colaborador.clickupId);

  const inicioTexto = `${desde.getDate()} de ${MESES[desde.getMonth()]}`;
  const finTexto = `${hasta.getDate()} de ${MESES[hasta.getMonth()]}`;

  const partes = [];
  partes.push(`*RESUMEN SEMANAL — ${inicioTexto} al ${finTexto}*`);
  partes.push(`FRIDAY · Repanic & Barsante`);
  partes.push('');
  partes.push(separador());
  partes.push(`Tareas completadas esta semana: *${completadasSemana.length}*`);
  partes.push(`Tareas atrasadas: *${atrasadas.length}*`);
  partes.push('');

  if (atrasadas.length > 0) {
    partes.push('*ATRASADAS*');
    partes.push(separador());
    for (const t of atrasadas.slice(0, 8)) {
      partes.push(formatearTareaAtrasada(t));
      partes.push('');
    }
  }

  if (paraHoy.length > 0) {
    partes.push('*PARA HOY*');
    partes.push(separador());
    for (const t of paraHoy) {
      partes.push(formatearTareaSimple(t));
    }
    partes.push('');
  }

  if (proximamente.length > 0) {
    partes.push('*PRÓXIMOS DÍAS*');
    partes.push(separador());
    for (const t of proximamente) {
      partes.push(formatearTareaSimple(t));
    }
    partes.push('');
  }

  try {
    const systemPrompt = `Sos FRIDAY, asistente operativo de Repanic & Barsante.
Escribí un resumen semanal para ${colaborador.nombre} (2-3 oraciones de conclusión + 2-3 oraciones de próximos pasos).
Datos: ${completadasSemana.length} completadas esta semana, ${atrasadas.length} atrasadas, ${paraHoy.length} para hoy, ${proximamente.length} próximas.
Tono: cercano, evaluativo, concreto.`;

    const texto = await generarTexto(systemPrompt, 'Generá el resumen semanal.', 400);
    partes.push('*Conclusión semanal:*');
    partes.push(separador());
    partes.push(texto.trim());
  } catch (err) {
    console.error(`[Weekly] Error generando resumen para ${colaborador.nombre}:`, err.message);
  }

  return partes.join('\n');
}

module.exports = { construirReporteSemanal };
