const { getTareasTodos, estaTerminada } = require('../clickup/tasks');
const { getColaboradores } = require('../sheets/colaboradores');
const { generarTexto } = require('../brain/claude');
const { calcularDemora, formatearFecha } = require('../utils/dates');
const { enviarANumero } = require('../whatsapp/sender');
const { separador } = require('../utils/format');

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function periodoTexto() {
  const hoy = new Date();
  const dia = hoy.getDate();
  const mes = MESES[hoy.getMonth()];
  const anio = hoy.getFullYear();
  if (dia <= 15) {
    return `1 al 15 de ${mes} ${anio}`;
  } else {
    const ultimoDia = new Date(anio, hoy.getMonth() + 1, 0).getDate();
    return `16 al ${ultimoDia} de ${mes} ${anio}`;
  }
}

async function enviarReporteQuincenal() {
  const grupoId = process.env.GRUPO_GENERAL_ID;
  if (!grupoId) {
    console.log('[Biweekly] GRUPO_GENERAL_ID no configurado, saltando');
    return;
  }

  console.log('[Biweekly] Generando reporte quincenal...');
  try {
    const colaboradores = await getColaboradores();
    const todasLasTareas = await getTareasTodos();

    const terminadas = todasLasTareas.filter(t => estaTerminada(t));
    const atrasadas = todasLasTareas.filter(t =>
      !estaTerminada(t) && t.fechaLimite && calcularDemora(t.fechaLimite) > 0
    );

    // Agrupar por cliente
    const porCliente = {};
    for (const t of terminadas) {
      porCliente[t.cliente] = (porCliente[t.cliente] || 0) + 1;
    }

    // Agrupar por colaborador
    const porColaborador = {};
    for (const [, colab] of colaboradores) {
      if (!colab.clickupId) continue;
      const completadas = terminadas.filter(t => t.asignados.some(a => a.id === colab.clickupId));
      const atrasadasColab = atrasadas.filter(t => t.asignados.some(a => a.id === colab.clickupId));
      if (completadas.length > 0 || atrasadasColab.length > 0) {
        porColaborador[colab.nombre] = {
          completadas: completadas.length,
          atrasadas: atrasadasColab.length,
        };
      }
    }

    const clientesTexto = Object.entries(porCliente)
      .sort(([,a],[,b]) => b - a)
      .map(([cliente, n]) => `  • ${cliente}: ${n} tareas`)
      .join('\n');

    const colaboradoresTexto = Object.entries(porColaborador)
      .map(([nombre, stats]) => `  • ${nombre}: ${stats.completadas} completadas, ${stats.atrasadas} atrasadas`)
      .join('\n');

    const partes = [];
    partes.push(`*REPORTE QUINCENAL R&B — ${periodoTexto()}*`);
    partes.push(`FRIDAY · Repanic & Barsante`);
    partes.push('');
    partes.push(separador());
    partes.push(`*TAREAS TOTALES REALIZADAS: ${terminadas.length}*`);
    partes.push('');

    if (clientesTexto) {
      partes.push('*Por cliente:*');
      partes.push(clientesTexto);
      partes.push('');
    }

    if (colaboradoresTexto) {
      partes.push('*Por colaborador:*');
      partes.push(colaboradoresTexto);
      partes.push('');
    }

    partes.push(`*TAREAS ATRASADAS: ${atrasadas.length}*`);
    partes.push('');

    // Conclusión general con Claude
    try {
      const systemPrompt = `Sos FRIDAY, asistente operativo de Repanic & Barsante.
Escribí un análisis quincenal del equipo (4-5 oraciones).
Datos: ${terminadas.length} tareas completadas, ${atrasadas.length} atrasadas.
Colaboradores con más atrasos: ${Object.entries(porColaborador).filter(([,s]) => s.atrasadas > 0).map(([n,s]) => `${n}(${s.atrasadas})`).join(', ') || 'ninguno'}.
Tono: evaluativo, profesional pero cercano. Incluí predicciones para la próxima quincena.`;

      const conclusion = await generarTexto(systemPrompt, 'Generá el análisis quincenal.', 500);
      partes.push('*DESEMPEÑO DEL EQUIPO*');
      partes.push(separador());
      partes.push(conclusion.trim());
    } catch (err) {
      console.error('[Biweekly] Error generando conclusión:', err.message);
    }

    // Envío al grupo según proveedor (Whapi soporta grupos; Baileys directo)
    const texto = partes.join('\n');
    if ((process.env.WHATSAPP_PROVIDER || 'baileys').toLowerCase() === 'whapi') {
      const { enviarTexto } = require('../whatsapp/whapi');
      await enviarTexto(grupoId, texto);
      console.log('[Biweekly] Reporte quincenal enviado al grupo (Whapi)');
    } else {
      const { getSock } = require('../whatsapp/client');
      const sock = getSock();
      if (sock) {
        await sock.sendMessage(grupoId, { text: texto });
        console.log('[Biweekly] Reporte quincenal enviado al grupo (Baileys)');
      }
    }

  } catch (err) {
    console.error('[Biweekly] Error:', err.message);
  }
}

module.exports = { enviarReporteQuincenal };
