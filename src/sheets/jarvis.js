const { leerRango } = require('./client');

const JARVIS_SHEET_ID = '18h8oo3IqrW1ov5WddVcNsE0AebAQhIETn2UbFv7HsOU';
const HOJA = 'Clientes_Cobranza';

let cacheJarvis = null;
let ultimaCarga = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

async function cargarDatosJarvis() {
  try {
    const filas = await leerRango(JARVIS_SHEET_ID, `${HOJA}!A2:Z200`);
    if (!filas || filas.length === 0) return [];

    // Leer headers de la primera fila
    const headers = filas[0].map(h => h?.toLowerCase?.()?.trim() || '');
    const datos = [];

    for (let i = 1; i < filas.length; i++) {
      const fila = filas[i];
      if (!fila || !fila[0]) continue;
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = fila[idx] || ''; });
      datos.push(obj);
    }

    cacheJarvis = datos;
    ultimaCarga = Date.now();
    return datos;
  } catch (err) {
    console.error('[JARVIS] Error leyendo sheet:', err.message);
    return cacheJarvis || [];
  }
}

async function getDatosJarvis() {
  if (!ultimaCarga || Date.now() - ultimaCarga > CACHE_TTL_MS) {
    await cargarDatosJarvis();
  }
  return cacheJarvis || [];
}

async function getClientesConMora() {
  const datos = await getDatosJarvis();
  return datos.filter(row => {
    const mora = Object.entries(row).find(([k]) => k.includes('mora') || k.includes('deuda') || k.includes('vencido'));
    if (!mora) return false;
    const valor = parseFloat(mora[1]?.replace(/[^0-9.-]/g, '') || '0');
    return valor > 0;
  });
}

async function getResumenFinanciero() {
  const datos = await getDatosJarvis();
  if (datos.length === 0) return null;

  // Intentar extraer MRR total y mora total de forma flexible
  let resumen = `Datos de ${datos.length} clientes cargados desde JARVIS.\n`;
  resumen += `Para consultas específicas preguntame por cliente o concepto.`;
  return resumen;
}

module.exports = { getDatosJarvis, getClientesConMora, getResumenFinanciero };
