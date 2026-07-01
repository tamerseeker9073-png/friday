const { getTareasTodos, clasificarTareasParaColaborador } = require('../clickup/tasks');
const { getColaboradores } = require('../sheets/colaboradores');
const { alertaYaEnviada, marcarAlertaEnviada, getContadorAlerta } = require('../state/manager');
const { enviarANumero } = require('../whatsapp/sender');
const { calcularDemora, formatearFecha } = require('../utils/dates');
const { emojiDemora } = require('../utils/dates');
const { getDatosJarvis } = require('../sheets/jarvis');

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

// Fase 7: extraer valor numérico de un cliente desde datos JARVIS para priorización
function pesoCliente(clienteNombre, jarvisData) {
  if (!jarvisData || !clienteNombre) return 0;
  const clienteLower = clienteNombre.toLowerCase();
  const fila = jarvisData.find(row =>
    Object.values(row).some(v => String(v).toLowerCase().includes(clienteLower))
  );
  if (!fila) return 0;
  // Buscar columna de MRR, valor, facturacion o monto
  const entry = Object.entries(fila).find(([k]) =>
    ['mrr', 'valor', 'factura', 'monto', 'honorario'].some(p => k.includes(p))
  );
  if (!entry) return 0;
  return parseFloat(String(entry[1]).replace(/[^0-9.]/g, '') || '0') || 0;
}

async function verificarEscalaciones() {
  console.log('[Escalation] Verificando atrasos...');
  try {
    const colaboradores = await getColaboradores();
    const todasLasTareas = await getTareasTodos();
    let jarvisData = [];
    try { jarvisData = await getDatosJarvis() || []; } catch (_) {}

    const atrasadosPorAcuna = [];

    for (const [numero, colaborador] of colaboradores) {
      if (!colaborador.clickupId) continue;

      const { atrasadas } = clasificarTareasParaColaborador(todasLasTareas, colaborador.clickupId);

      for (const tarea of atrasadas) {
        const dias = calcularDemora(tarea.fechaLimite);
        if (!dias || dias < 5) continue;

        if (dias >= 10) {
          if (!alertaYaEnviada(tarea.id, 'escalacion-10')) {
            const veces = getContadorAlerta(tarea.id, 'escalacion-10');
            const msgExtra = veces >= 3 ? `\n_(Aviso #${veces + 1} — seguimiento semanal)_` : '';
            enviarANumero(numero, mensajeFirme(colaborador, tarea, dias) + msgExtra);
            marcarAlertaEnviada(tarea.id, 'escalacion-10');
            console.log(`[Escalation] Firme (${dias}d, #${veces + 1}) "${tarea.nombre}" → ${numero}`);
          }
        } else if (dias >= 5) {
          if (!alertaYaEnviada(tarea.id, 'escalacion-5')) {
            enviarANumero(numero, mensajeCordial(colaborador, tarea, dias));
            marcarAlertaEnviada(tarea.id, 'escalacion-5');
            console.log(`[Escalation] Cordial (${dias}d) "${tarea.nombre}" → ${numero}`);
          }
        }

        if (colaborador.nivel === 'colaborador' && dias >= 5) {
          atrasadosPorAcuna.push({ colaborador, tarea, dias, numero });
        }
      }
    }

    // ── Fase 7: Ordenar por peso de cliente (JARVIS MRR) desc, luego por días atraso ──
    atrasadosPorAcuna.sort((a, b) => {
      const pesoA = pesoCliente(a.tarea.cliente, jarvisData);
      const pesoB = pesoCliente(b.tarea.cliente, jarvisData);
      if (pesoB !== pesoA) return pesoB - pesoA;
      return b.dias - a.dias;
    });

    // ── Resumen consolidado a Acuña ──────────────────────────────────────
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

    // ── Fase 5: Alerta compuesta a Pato — mora JARVIS + tareas atrasadas ─
    await verificarAlertalMoraJarvis(atrasadosPorAcuna, jarvisData);

  } catch (err) {
    console.error('[Escalation] Error:', err.message);
  }
}

async function verificarAlertalMoraJarvis(atrasados, jarvisData) {
  if (!jarvisData || jarvisData.length === 0) return;
  const patoNum = PATO_NUMBER();
  if (!patoNum) return;

  const clave = `pato-mora-${new Date().toISOString().split('T')[0]}`;
  if (alertaYaEnviada(clave, 'mora-jarvis')) return;

  // Detectar clientes con mora en JARVIS
  const clientesConMora = jarvisData.filter(row => {
    const entry = Object.entries(row).find(([k]) =>
      k.includes('mora') || k.includes('deuda') || k.includes('vencido') || k.includes('pendiente')
    );
    if (!entry) return false;
    const valor = parseFloat(String(entry[1]).replace(/[^0-9.-]/g, '') || '0');
    return valor > 0;
  });

  if (clientesConMora.length === 0) return;

  // Cruzar con tareas atrasadas
  const cruces = [];
  for (const mora of clientesConMora) {
    const nombreCliente = mora.cliente || mora.razon_social || mora.nombre || Object.values(mora)[0];
    if (!nombreCliente) continue;
    const tareasDelCliente = atrasados.filter(a =>
      a.tarea.cliente?.toLowerCase().includes(nombreCliente.toLowerCase()) ||
      nombreCliente.toLowerCase().includes(a.tarea.cliente?.toLowerCase() || '')
    );
    if (tareasDelCliente.length > 0) {
      cruces.push({ cliente: nombreCliente, mora, tareas: tareasDelCliente });
    }
  }

  if (cruces.length === 0) return;

  let msg = `⚠️ FRIDAY · Alerta combinada mora + producción\n\n`;
  msg += `Clientes con deuda pendiente en JARVIS Y tareas atrasadas en ClickUp:\n\n`;
  for (const { cliente, tareas } of cruces) {
    msg += `*${cliente}*\n`;
    for (const { tarea, dias } of tareas) {
      msg += `  ${emojiDemora(dias)} ${tarea.nombre} — ${dias} días atraso\n`;
    }
    msg += '\n';
  }
  msg += `Revisá si hay relación entre la deuda y el bloqueo de producción.`;

  enviarANumero(patoNum, msg.trim());
  marcarAlertaEnviada(clave, 'mora-jarvis');
  console.log(`[Escalation] Alerta mora+producción enviada a Pato (${cruces.length} clientes cruzados)`);
}

module.exports = { verificarEscalaciones };
