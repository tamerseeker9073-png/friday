const http = require('http');
const { estaConectado } = require('./whatsapp/client');

let _enviarANumero = null;
function registrarSender(fn) { _enviarANumero = fn; }

function leerBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function iniciarHealthcheck() {
  const PORT = process.env.PORT || 3000;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: estaConectado() ? 'ok' : 'reconnecting',
        whatsapp: estaConectado(),
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // Endpoint admin: POST /admin/send { to, message }
    if (req.method === 'POST' && req.url === '/admin/send') {
      const token = req.headers['x-admin-token'] || '';
      if (ADMIN_TOKEN && token !== ADMIN_TOKEN) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      if (!_enviarANumero) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'Sender not ready' }));
        return;
      }
      const body = await leerBody(req);
      if (!body.to || !body.message) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing to or message' }));
        return;
      }
      _enviarANumero(body.to, body.message);
      console.log(`[Admin] Mensaje encolado → ${body.to}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, to: body.to }));
      return;
    }

    res.writeHead(200);
    res.end('FRIDAY — Repanic & Barsante');
  });

  server.listen(PORT, () => {
    console.log(`[Health] Servidor en puerto ${PORT}`);
  });
}

module.exports = { iniciarHealthcheck, registrarSender };
