const http = require('http');
const { estaConectado } = require('./whatsapp/client');

function iniciarHealthcheck() {
  const PORT = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const conectado = estaConectado();
      const status = conectado ? 200 : 503;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: conectado ? 'ok' : 'disconnected',
        whatsapp: conectado,
        timestamp: new Date().toISOString(),
      }));
    } else {
      res.writeHead(200);
      res.end('FRIDAY — Repanic & Barsante');
    }
  });

  server.listen(PORT, () => {
    console.log(`[Health] Servidor en puerto ${PORT}`);
  });
}

module.exports = { iniciarHealthcheck };
