const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'session', 'state.json');

let estado = {
  alertasEnviadas: {},   // `${taskId}:${tipo}` → timestamp
  ultimosReportes: {},   // `${numero}:daily` → fecha YYYY-MM-DD
};

function cargarEstado() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      estado = { ...estado, ...JSON.parse(raw) };
      console.log('[State] Estado cargado desde disco');
    }
  } catch (err) {
    console.error('[State] Error cargando estado:', err.message);
  }
}

function guardarEstado() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(estado, null, 2), 'utf8');
  } catch (err) {
    console.error('[State] Error guardando estado:', err.message);
  }
}

function alertaYaEnviada(taskId, tipo) {
  const key = `${taskId}:${tipo}`;
  if (!estado.alertasEnviadas[key]) return false;
  // Las alertas de atraso se resetean cada día
  const hoy = new Date().toISOString().split('T')[0];
  const fechaEnviada = estado.alertasEnviadas[key].split('T')[0];
  return fechaEnviada === hoy;
}

function marcarAlertaEnviada(taskId, tipo) {
  const key = `${taskId}:${tipo}`;
  estado.alertasEnviadas[key] = new Date().toISOString();
  guardarEstado();
}

function reporteYaEnviado(numero, tipo) {
  const key = `${numero}:${tipo}`;
  if (!estado.ultimosReportes[key]) return false;
  const hoy = new Date().toISOString().split('T')[0];
  return estado.ultimosReportes[key] === hoy;
}

function marcarReporteEnviado(numero, tipo) {
  const key = `${numero}:${tipo}`;
  estado.ultimosReportes[key] = new Date().toISOString().split('T')[0];
  guardarEstado();
}

// Limpieza de alertas viejas (más de 30 días)
function limpiarAlertasViejas() {
  const hace30Dias = new Date();
  hace30Dias.setDate(hace30Dias.getDate() - 30);
  for (const [key, ts] of Object.entries(estado.alertasEnviadas)) {
    if (new Date(ts) < hace30Dias) {
      delete estado.alertasEnviadas[key];
    }
  }
  guardarEstado();
}

module.exports = {
  cargarEstado,
  alertaYaEnviada,
  marcarAlertaEnviada,
  reporteYaEnviado,
  marcarReporteEnviado,
  limpiarAlertasViejas,
};
