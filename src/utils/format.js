const { formatearFecha, calcularDemora, emojiDemora } = require('./dates');

function nombreDia() {
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return DIAS[new Date().getDay()];
}

function fechaHoy() {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = new Date();
  return `${nombreDia()} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function formatearTareaAtrasada(tarea) {
  const demora = calcularDemora(tarea.fechaLimite);
  const emoji = emojiDemora(demora);
  const cliente = tarea.cliente || tarea.lista || 'sin cliente';
  const demora_texto = demora === 1 ? '1 día' : `${demora} días`;

  return `${emoji} *${tarea.nombre}*\n` +
         `   Cliente: ${cliente}\n` +
         `   Fecha límite: ${formatearFecha(tarea.fechaLimite)}\n` +
         `   Demora: ${demora_texto}\n` +
         `   Estado: ${tarea.estado}`;
}

function formatearTareaSimple(tarea) {
  const cliente = tarea.cliente || tarea.lista || 'sin cliente';
  const fecha = tarea.fechaLimite ? formatearFecha(tarea.fechaLimite) : 'sin fecha';
  return `• *${tarea.nombre}*\n   Cliente: ${cliente} · Vence: ${fecha}`;
}

function separador() {
  return '─────────────────────';
}

module.exports = {
  fechaHoy,
  formatearTareaAtrasada,
  formatearTareaSimple,
  separador,
};
