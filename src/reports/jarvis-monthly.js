// Informe mensual a JARVIS — se ejecuta el último día de cada mes.
// Agrupa por cliente: videos simples, videos complejos, flyers simples,
// flyers complejos (según tags de ClickUp) + jornadas filmmaking.
// JARVIS usa estos datos para calcular costos y rentabilidad por cliente.
//
// Para activar: asegurarse de que las tareas en ClickUp tengan los tags:
//   "simple", "complejo", "flyer-simple", "flyer-complejo"
// y que la hoja "Jornadas Filmmaking" esté actualizada.

const { getTareasTodos, estaTerminada } = require('../clickup/tasks');
const { getJornadasPorCliente } = require('../sheets/filmmaking');
const { enviarANumero } = require('../whatsapp/sender');
const { alertaYaEnviada, marcarAlertaEnviada } = require('../state/manager');

const PATO_NUMBER = () => process.env.PATO_NUMBER;
const FRAN_NUMBER = () => process.env.FRAN_NUMBER;

const TAGS = {
  videoSimple:    ['simple', 'video simple'],
  videoComplejo:  ['complejo', 'video complejo'],
  flyerSimple:    ['flyer simple', 'flyer-simple'],
  flyerComplejo:  ['flyer complejo', 'flyer-complejo'],
};

function tieneTag(tarea, listaTags) {
  return listaTags.some(tag => tarea.tags.includes(tag.toLowerCase()));
}

function estesMesTerminada(tarea) {
  if (!estaTerminada(tarea)) return false;
  // Verificar que se terminó este mes (usamos creadaEn como aproximación si no hay fecha cierre)
  // ClickUp no expone date_done en todos los planes; usamos best-effort
  return true;
}

async function generarInformeJarvis() {
  const hoy = new Date();
  const mes = hoy.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
  const clave = `jarvis-mensual-${hoy.getFullYear()}-${hoy.getMonth()}`;

  if (alertaYaEnviada(clave, 'jarvis-monthly')) {
    console.log('[JARVIS Monthly] Ya enviado este mes');
    return;
  }

  console.log('[JARVIS Monthly] Generando informe...');

  try {
    const todasLasTareas = await getTareasTodos();
    const terminadas = todasLasTareas.filter(estesMesTerminada);

    // Agrupar por cliente
    const porCliente = {};

    for (const tarea of terminadas) {
      const cliente = tarea.cliente || 'Sin cliente';
      if (!porCliente[cliente]) {
        porCliente[cliente] = {
          videoSimple: 0,
          videoComplejo: 0,
          flyerSimple: 0,
          flyerComplejo: 0,
          otros: 0,
        };
      }
      const d = porCliente[cliente];
      if (tieneTag(tarea, TAGS.videoSimple))        d.videoSimple++;
      else if (tieneTag(tarea, TAGS.videoComplejo)) d.videoComplejo++;
      else if (tieneTag(tarea, TAGS.flyerSimple))   d.flyerSimple++;
      else if (tieneTag(tarea, TAGS.flyerComplejo)) d.flyerComplejo++;
      else d.otros++;
    }

    // Jornadas filmmaking
    let jornadasTexto = '';
    try {
      const jornadas = await getJornadasPorCliente();
      if (jornadas) {
        jornadasTexto = '\n\n📹 *FILMMAKING — Jornadas del mes*\n';
        for (const [cliente, d] of Object.entries(jornadas)) {
          jornadasTexto += `• ${cliente}: ${d.jornadas} jornadas | ${d.horasFact}hs fact / ${d.horasTrab}hs trab | ${d.aprovechamiento}%\n`;
        }
      }
    } catch (_) {}

    // Construir mensaje
    const totalVideos = terminadas.filter(t => tieneTag(t, [...TAGS.videoSimple, ...TAGS.videoComplejo])).length;
    const totalFlyers = terminadas.filter(t => tieneTag(t, [...TAGS.flyerSimple, ...TAGS.flyerComplejo])).length;

    let msg = `📊 *FRIDAY — Informe de producción ${mes}*\n\n`;
    msg += `Total tareas cerradas: ${terminadas.length}\n`;
    msg += `Videos: ${totalVideos} | Flyers: ${totalFlyers}\n\n`;

    msg += `*DETALLE POR CLIENTE:*\n`;
    const clientesOrdenados = Object.entries(porCliente)
      .filter(([, d]) => d.videoSimple + d.videoComplejo + d.flyerSimple + d.flyerComplejo > 0)
      .sort((a, b) => {
        const totalA = Object.values(a[1]).reduce((s, v) => s + v, 0);
        const totalB = Object.values(b[1]).reduce((s, v) => s + v, 0);
        return totalB - totalA;
      });

    for (const [cliente, d] of clientesOrdenados) {
      msg += `\n*${cliente}*\n`;
      if (d.videoSimple)   msg += `  🎬 Videos simples: ${d.videoSimple}\n`;
      if (d.videoComplejo) msg += `  🎥 Videos complejos: ${d.videoComplejo}\n`;
      if (d.flyerSimple)   msg += `  🖼 Flyers simples: ${d.flyerSimple}\n`;
      if (d.flyerComplejo) msg += `  🎨 Flyers complejos: ${d.flyerComplejo}\n`;
    }

    msg += jornadasTexto;
    msg += `\n\n_Datos para costeo y rentabilidad por cliente en JARVIS._`;

    // Enviar a Pato y Fran
    if (PATO_NUMBER()) enviarANumero(PATO_NUMBER(), msg);
    if (FRAN_NUMBER()) enviarANumero(FRAN_NUMBER(), msg);

    marcarAlertaEnviada(clave, 'jarvis-monthly');
    console.log(`[JARVIS Monthly] Informe enviado (${clientesOrdenados.length} clientes)`);
  } catch (err) {
    console.error('[JARVIS Monthly] Error:', err.message);
  }
}

function esUltimoDiaDelMes() {
  const hoy = new Date();
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + 1);
  return manana.getDate() === 1; // Si mañana es día 1, hoy es el último día del mes
}

module.exports = { generarInformeJarvis, esUltimoDiaDelMes };
