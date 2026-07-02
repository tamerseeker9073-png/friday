#!/usr/bin/env node
// Actualiza WHATSAPP_SESSION_B64 en Railway con la sesión local actual.
// Usar después de re-escanear QR para que Railway reconecte sin QR.
// Uso: node scripts/actualizar-sesion-railway.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_DIR = path.join(__dirname, '..', 'session');
const TMP_TAR = path.join(os.tmpdir(), 'wa-session-update.tar.gz');

console.log('Empaquetando sesión local...');

if (!fs.existsSync(path.join(SESSION_DIR, 'creds.json'))) {
  console.error('Error: no hay creds.json en session/. Escaneá el QR primero con:');
  console.error('  node scripts/enviar-mensaje.js');
  process.exit(1);
}

execSync(`tar -czf "${TMP_TAR}" -C "${SESSION_DIR}" .`);
const b64 = execSync(`base64 -i "${TMP_TAR}"`).toString().replace(/\n/g, '');
fs.unlinkSync(TMP_TAR);

console.log(`Sesión empaquetada (${b64.length} chars). Subiendo a Railway...`);

try {
  execSync(`railway variables set WHATSAPP_SESSION_B64="${b64}"`, { stdio: 'inherit' });
  console.log('');
  console.log('✅ Sesión actualizada en Railway.');
  console.log('Railway va a redeplegar automáticamente y conectar sin QR.');
  console.log('');
  console.log('Si querés forzar redeploy ahora: railway redeploy --yes');
} catch (e) {
  console.error('Error subiendo a Railway:', e.message);
  console.error('Asegurate de estar linkeado al proyecto friday:');
  console.error('  railway link → elegí kind-integrity → friday');
  process.exit(1);
}
