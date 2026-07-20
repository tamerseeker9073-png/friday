const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function hoy() {
  return new Date();
}

function formatearFecha(date) {
  if (!date) return 'sin fecha';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'sin fecha';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatearFechaCorta(date) {
  if (!date) return 'sin fecha';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'sin fecha';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function calcularDemora(fechaLimite) {
  if (!fechaLimite) return null;
  const limite = new Date(fechaLimite);
  if (isNaN(limite.getTime())) return null;
  const ahora = hoy();
  ahora.setHours(0, 0, 0, 0);
  limite.setHours(0, 0, 0, 0);
  const diff = Math.floor((ahora - limite) / (1000 * 60 * 60 * 24));
  return diff;
}

function emojiDemora(dias) {
  if (dias === null) return '';
  if (dias < 0) return '😊';  // upcoming
  if (dias === 0) return '🤔'; // due today
  if (dias <= 7) return '😐';  // recently overdue
  return '😡';                  // very overdue
}

function estaAtrasada(fechaLimite) {
  const demora = calcularDemora(fechaLimite);
  return demora !== null && demora > 0;
}

function venceHoy(fechaLimite) {
  if (!fechaLimite) return false;
  const limite = new Date(fechaLimite);
  if (isNaN(limite.getTime())) return false;
  const ahora = hoy();
  return limite.getFullYear() === ahora.getFullYear() &&
         limite.getMonth() === ahora.getMonth() &&
         limite.getDate() === ahora.getDate();
}

function venceEnDias(fechaLimite, dias) {
  const demora = calcularDemora(fechaLimite);
  if (demora === null) return false;
  return demora >= -dias && demora < 0;
}

function inicioSemana() {
  const d = hoy();
  const dia = d.getDay();
  const lunes = new Date(d);
  lunes.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function finSemana() {
  const lunes = inicioSemana();
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);
  return domingo;
}

function fechaEnRango(fecha, desde, hasta) {
  if (!fecha) return false;
  const d = new Date(fecha);
  return d >= desde && d <= hasta;
}

module.exports = {
  hoy,
  formatearFecha,
  formatearFechaCorta,
  calcularDemora,
  emojiDemora,
  estaAtrasada,
  venceHoy,
  venceEnDias,
  inicioSemana,
  finSemana,
  fechaEnRango,
};
