const { leerRango } = require('./client');

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const HOJA = 'Colaboradores';

// numero → { nombre, rol, nivel, clickupId, activo }
let cacheColaboradores = new Map();
let ultimaCarga = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

async function cargarColaboradores() {
  const filas = await leerRango(SHEET_ID, `${HOJA}!A3:G100`);

  const mapa = new Map();
  for (const fila of filas) {
    const [nombre, rol, , numeroFormato, nivel, activo, clickupId] = fila;
    const activoNorm = activo?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!numeroFormato || activoNorm !== 'si') continue;

    const numero = numeroFormato.trim().replace(/\D/g, '');
    if (!numero) continue;

    mapa.set(numero, {
      nombre: nombre?.trim() || '',
      rol: rol?.trim() || '',
      nivel: nivel?.trim()?.toLowerCase() || 'colaborador',
      clickupId: clickupId?.trim() || null,
      activo: true,
    });
  }

  cacheColaboradores = mapa;
  ultimaCarga = Date.now();
  console.log(`[Sheets] ${mapa.size} colaboradores cargados`);
  return mapa;
}

async function getColaboradores() {
  if (!ultimaCarga || Date.now() - ultimaCarga > CACHE_TTL_MS) {
    await cargarColaboradores();
  }
  return cacheColaboradores;
}

async function getColaborador(numero) {
  const mapa = await getColaboradores();
  return mapa.get(numero) || null;
}

function getColaboradoresSync() {
  return cacheColaboradores;
}

module.exports = { cargarColaboradores, getColaboradores, getColaborador, getColaboradoresSync };
