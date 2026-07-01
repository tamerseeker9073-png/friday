const http = require('http');
const { estaConectado } = require('./whatsapp/client');

function iniciarHealthcheck() {
  const PORT = process.env.PORT || 3000;

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      // Siempre 200 — Railway solo debe reiniciar si el proceso muere, no si WA se desconecta temporalmente
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: estaConectado() ? 'ok' : 'reconnecting',
        whatsapp: estaConectado(),
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
