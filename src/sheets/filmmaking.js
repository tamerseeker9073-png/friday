const { leerRango } = require('./client');

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const HOJA = 'Jornadas Filmmaking';

async function getJornadasPorCliente() {
  try {
    const filas = await leerRango(SHEET_ID, `${HOJA}!A2:F200`);
    if (!filas || filas.length === 0) return null;

    const porCliente = {};
    for (const fila of filas) {
      const [fecha, cliente, horasFact, horasTrab, , aprovechamiento] = fila;
      if (!cliente) continue;
      if (!porCliente[cliente]) porCliente[cliente] = { horasFact: 0, horasTrab: 0, jornadas: 0 };
      porCliente[cliente].horasFact += parseFloat(horasFact || 0);
      porCliente[cliente].horasTrab += parseFloat(horasTrab || 0);
      porCliente[cliente].jornadas++;
    }

    // Calcular aprovechamiento por cliente
    for (const cliente of Object.keys(porCliente)) {
      const d = porCliente[cliente];
      d.aprovechamiento = d.horasTrab > 0
        ? Math.round((d.horasFact / d.horasTrab) * 100)
        : 0;
    }

    return porCliente;
  } catch (err) {
    // Hoja no existe todavía — retornar null silenciosamente
    return null;
  }
}

async function getClientesBajoAprovechamiento(umbral = 70) {
  const datos = await getJornadasPorCliente();
  if (!datos) return [];
  return Object.entries(datos)
    .filter(([, d]) => d.aprovechamiento < umbral)
    .map(([cliente, d]) => ({ cliente, ...d }));
}

module.exports = { getJornadasPorCliente, getClientesBajoAprovechamiento };
