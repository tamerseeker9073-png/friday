const { clasificarTareasParaColaborador, estaTerminada } = require('../clickup/tasks');
const { generarTexto } = require('../brain/claude');
const { buildSystemPromptReporteConclusion } = require('../brain/context');
const { fechaHoy, formatearTareaAtrasada, formatearTareaSimple, separador } = require('../utils/format');
const { calcularDemora, estaAtrasada } = require('../utils/dates');
const { esSupervisor } = require('../brain/access');

async function construirReporteEquipo(colaborador, todasLasTareas) {
  const activas = todasLasTareas.filter(t => !estaTerminada(t));
  const atrasadas = activas.filter(t => t.fechaLimite && estaAtrasada(t.fechaLimite));
  const paraHoy = activas.filter(t => {
    if (!t.fechaLimite) return false;
    const demora = calcularDemora(t.fechaLimite);
    return demora === 0;
  });
  const sinAsignar = activas.filter(t => !t.asignados || t.asignados.length === 0);

  const partes = [];
  partes.push(`Buenos días ${colaborador.nombre} — FRIDAY · ${fechaHoy()}`);
  partes.push('');
  partes.push(`📊 *RESUMEN DEL EQUIPO*`);
  partes.push('');
  partes.push(`Total activas: *${activas.length}*`);
  partes.push(`Atrasadas: *${atrasadas.length}*`);
  partes.push(`Para hoy: *${paraHoy.length}*`);
  partes.push(`Sin asignar: *${sinAsignar.length}*`);
  partes.push('');

  if (atrasadas.length > 0) {
    partes.push(`😡 *ATRASADAS (${Math.min(atrasadas.length, 5)} de ${atrasadas.length})*`);
    partes.push('');
    for (const t of atrasadas.slice(0, 5)) {
      partes.push(formatearTareaAtrasada(t));
      partes.push('');
    }
  }

  return partes.join('\n');
}

async function construirReporteDiario(colaborador, todasLasTareas) {
  if (!colaborador.clickupId) {
    if (esSupervisor(colaborador.nivel)) {
      console.log(`[Daily] ${colaborador.nombre} sin clickupId pero es ${colaborador.nivel} → reporte de equipo`);
      return construirReporteEquipo(colaborador, todasLasTareas);
    }
    console.log(`[Daily] ${colaborador.nombre} sin clickupId y no es supervisor → sin reporte`);
    return null;
  }

  const { atrasadas, paraHoy, proximamente } = clasificarTareasParaColaborador(
    todasLasTareas,
    colaborador.clickupId
  );

  const partes = [];

  // Encabezado
  partes.push(`Buenos días ${colaborador.nombre} — FRIDAY · ${fechaHoy()}`);
  partes.push('');

  // Tareas atrasadas
  if (atrasadas.length > 0) {
    partes.push('*TAREAS ATRASADAS*');
    partes.push(separador());
    for (const t of atrasadas) {
      partes.push(formatearTareaAtrasada(t));
      partes.push('');
    }
    partes.push('_Si estas tareas no están en ejecución, eliminalas si no corresponden, marcalas como completadas si ya las hiciste, o ejecutalas hoy._');
    partes.push('');
  }

  // Para hoy
  if (paraHoy.length > 0) {
    partes.push('*PARA HOY*');
    partes.push(separador());
    for (const t of paraHoy) {
      partes.push(formatearTareaSimple(t));
    }
    partes.push('');
  }

  // Próximamente
  if (proximamente.length > 0) {
    partes.push('*PRÓXIMAMENTE*');
    partes.push(separador());
    for (const t of proximamente) {
      partes.push(formatearTareaSimple(t));
    }
    partes.push('');
  }

  // Si no hay nada
  if (atrasadas.length === 0 && paraHoy.length === 0 && proximamente.length === 0) {
    partes.push('✅ No tenés tareas pendientes ni próximas. Buen trabajo.');
    partes.push('');
  }

  // Conclusión generada por Claude
  try {
    const systemPrompt = buildSystemPromptReporteConclusion(colaborador, {
      atrasadas: atrasadas.length,
      paraHoy: paraHoy.length,
      proximamente: proximamente.length,
    });
    const conclusion = await generarTexto(
      systemPrompt,
      `Escribí la conclusión para el reporte diario de ${colaborador.nombre}.`,
      300
    );
    partes.push('*CONCLUSIÓN*');
    partes.push(separador());
    partes.push(conclusion.trim());
  } catch (err) {
    console.error(`[Daily] Error generando conclusión para ${colaborador.nombre}:`, err.message);
  }

  return partes.join('\n');
}

module.exports = { construirReporteDiario };
