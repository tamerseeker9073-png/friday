const { google } = require('googleapis');

let sheetsClient = null;

function getCredentials() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!raw) throw new Error('GOOGLE_CREDENTIALS_JSON no está definida');
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    // Si no es base64, intentar como JSON directo
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('GOOGLE_CREDENTIALS_JSON no es JSON válido ni base64 válido');
    }
  }
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function leerRango(spreadsheetId, rango) {
  const client = await getSheetsClient();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: rango,
  });
  return res.data.values || [];
}

module.exports = { getSheetsClient, leerRango };
