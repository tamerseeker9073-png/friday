'use strict';

// Monthly production sheet writer.
// Writes one row per client per closing to the PRODUCCION_MENSUAL sheet.

const { getSheetsClient } = require('./client');

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID || '1DLppOhHSg0iNHad9ddKF64EIcB7OcDvvionhcZJXTEw';
const SHEET_NAME = 'PRODUCCION_MENSUAL';

const HEADERS = [
  'Mes',
  'Cliente',
  'Videos Complejos',
  'Videos Simples',
  'Flyers Complejos',
  'Flyers Simples',
  'Jornadas Producción',
  'App Level USD',
];

// Clients with a paid app subscription
const APP_LEVEL_USD = {
  fausol: 49,
  'centro moto vm': 49,
  centrovm: 49,
  'sm motos': 49,
};

function resolveAppLevel(clienteNombre) {
  const key = clienteNombre.toLowerCase().trim();
  return APP_LEVEL_USD[key] || 0;
}

/**
 * Returns the sheet ID (gid) for PRODUCCION_MENSUAL, creating the sheet if absent.
 * @param {object} client - google sheets client
 * @returns {Promise<number>} sheet id
 */
async function _ensureSheet(client) {
  const meta = await client.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheets = meta.data.sheets || [];
  const existing = sheets.find(s => s.properties.title === SHEET_NAME);
  if (existing) return existing.properties.sheetId;

  // Sheet doesn't exist — create it
  const res = await client.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: SHEET_NAME },
          },
        },
      ],
    },
  });

  const addedSheet = res.data.replies[0].addSheet;
  return addedSheet.properties.sheetId;
}

/**
 * Returns true if the sheet has no data rows yet (i.e. is empty or only has headers).
 * We check by reading A1 — if blank, we write headers first.
 * @param {object} client
 * @returns {Promise<boolean>}
 */
async function _sheetIsEmpty(client) {
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
  });
  const values = res.data.values;
  return !values || values.length === 0 || !values[0] || values[0][0] === '';
}

/**
 * Write monthly production data to the PRODUCCION_MENSUAL sheet.
 *
 * @param {string} mes - Month label, e.g. "junio 2025"
 * @param {Array<{
 *   cliente: string,
 *   videosComplejos: number,
 *   videosSimples: number,
 *   flyersComplejos: number,
 *   flyersSimples: number,
 *   jornadasProduccion: number
 * }>} filasPorCliente
 */
async function escribirProduccionMensual(mes, filasPorCliente) {
  const client = await getSheetsClient();

  // Ensure sheet exists (creates it if absent)
  await _ensureSheet(client);

  const isEmpty = await _sheetIsEmpty(client);

  const rows = [];

  if (isEmpty) {
    rows.push(HEADERS);
  }

  for (const fila of filasPorCliente) {
    const appLevel = resolveAppLevel(fila.cliente);
    rows.push([
      mes,
      fila.cliente,
      fila.videosComplejos,
      fila.videosSimples,
      fila.flyersComplejos,
      fila.flyersSimples,
      fila.jornadasProduccion,
      appLevel,
    ]);
  }

  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

module.exports = { escribirProduccionMensual };
