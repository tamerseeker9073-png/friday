const { getTareasDeColaborador } = require('../clickup/tasks');
const { generarTexto } = require('../brain/claude');
const { inicioSemana, finSemana, formatearFecha, fechaEnRango } = require('../utils/dates');
const { separador } = require('../utils/format');

const ESTADOS_TERMINADO = ['terminado', 'complete', 'closed', 'done'];

async function construirReporteSemanal(colaborador) {
  if (!colaborador.clickupId) return null;

  const tareas = await getTareasDeColaborador(colaborador.clickupId);
  const desde = inicioSemana();
  const hasta = finSemana();

  const completadasSemana = tareas.filter(t =>
    ESTADOS_TERMINADO.includes(t.estado?.toLowerCase()) &&
    t.creadaEn && fechaEnRango(t.creadaEn, desde, hasta)
  );

  const atrasadas = tareas.filter(t =>
    !ESTADOS_TERMINADO.includes(t.estado?.toLowerCase()) &&
    t.fechaLimite && new Date(t.fechaLimite) < new Date()
  );

  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d = new Date();
  const inicioTexto = `${desde.getDate()} de ${MESES[desde.getMonth()]}`;
  const finTexto = `${hasta.getDate()} de ${MESES[hasta.getMonth()]}`;

  const partes = [];
  partes.push(`*RESUMEN SEMANAL — ${inicioTexto} al ${finTexto}*`);
  partes.push(`FRIDAY · Repanic & Barsante`);
  partes.push('');
  partes.push(separador());
  partes.push(`Tareas completadas esta semana: *${completadasSemana.length}*`);
  partes.push(`Atrasadas: *${atrasadas.length}*`);
  partes.push('');

  try {
    const systemPrompt = `Sos FRIDAY, asistente operativo de Repanic & Barsante.
Escribí un resumen semanal breve (3-4 oraciones) para ${colaborador.nombre}.
Datos: ${completadasSemana.length} tareas completadas, ${atrasadas.length} atrasadas.
Tono: cercano, directo, evaluativo. Incluí próximos pasos concretos.`;

    const texto = await generarTexto(systemPrompt, 'Generá el resumen semanal.', 400);
    partes.push('*Conclusión semanal:*');
    partes.push(texto.trim());
    partes.push('');
    partes.push('*Próximos pasos:*');
    partes.push('_(Ver tareas próximas en el reporte de mañana lunes)_');
  } catch (err) {
    console.error(`[Weekly] Error generando resumen para ${colaborador.nombre}:`, err.message);
  }

  return partes.join('\n');
}

module.exports = { construirReporteSemanal };
