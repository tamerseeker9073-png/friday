const http = require('http');
const QRCode = require('qrcode');
const { estaConectado, getQR, getPairingCode } = require('./whatsapp/client');

let _enviarANumero = null;
let _onMessageMeta = null;
function registrarSender(fn) { _enviarANumero = fn; }
function registrarHandlerMeta(fn) { _onMessageMeta = fn; }

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
      const whapi = (process.env.WHATSAPP_PROVIDER || 'baileys').toLowerCase() === 'whapi';
      const ok = whapi ? true : estaConectado(); // Whapi es REST, el proceso vivo = ok
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: ok ? 'ok' : 'reconnecting',
        proveedor: whapi ? 'whapi' : 'baileys',
        whatsapp: ok,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // Vincular WhatsApp escaneando el QR desde el navegador
    if (req.url === '/qr') {
      if (estaConectado()) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ FRIDAY ya está conectado a WhatsApp</h2></body></html>');
        return;
      }
      const codigo = getPairingCode();
      const qr = getQR();
      if (!codigo && !qr) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff"><h2>⏳ Generando código... refrescá en 5 segundos</h2><script>setTimeout(()=>location.reload(),5000)</script></body></html>');
        return;
      }
      const codigoFmt = codigo ? codigo.match(/.{1,4}/g).join(' ') : null;
      const imgQR = qr ? `<img src="${await QRCode.toDataURL(qr, { width: 300 })}" style="border:8px solid #fff;border-radius:12px"/>` : '';
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:36px;background:#111;color:#fff">
        <h2>FRIDAY — Vincular WhatsApp</h2>
        ${codigo ? `
        <div style="margin:24px auto;max-width:420px;background:#1c1c1c;border:1px solid #333;border-radius:14px;padding:24px">
          <p style="color:#aaa;margin:0 0 8px">Método recomendado — con número de teléfono:</p>
          <p style="margin:6px 0"><b>WhatsApp → Dispositivos vinculados → Vincular un dispositivo → "Vincular con número de teléfono"</b></p>
          <div style="font-size:34px;font-weight:800;letter-spacing:6px;margin:16px 0;color:#22c55e">${codigoFmt}</div>
          <p style="color:#888;font-size:12px;margin:0">Ingresá este código en el teléfono de FRIDAY</p>
        </div>` : ''}
        ${imgQR ? `<p style="color:#888;margin-top:20px">o escaneá el QR (respaldo):</p>${imgQR}` : ''}
        <p style="color:#666;font-size:12px;margin-top:16px">Se refresca cada 15s</p>
        <script>setTimeout(()=>location.reload(),15000)</script>
      </body></html>`);
      return;
    }

    // Webhook Whapi.cloud — POST /whapi (mensajes entrantes)
    if (req.method === 'POST' && req.url === '/whapi') {
      const body = await leerBody(req);
      try {
        const { parsearWebhookWhapi } = require('./whatsapp/whapi');
        const { manejarMensaje } = require('./whatsapp/handler');
        for (const m of parsearWebhookWhapi(body)) {
          if (m.chatId && m.chatId.includes('@g.us')) continue; // ignorar grupos (igual que Baileys)
          if (!m.from || !m.texto) continue;
          console.log(`[Whapi] Mensaje de ${m.fromName || m.from}: "${m.texto.substring(0, 60)}"`);
          // Adaptar al formato que espera manejarMensaje (estilo Baileys)
          const fakeMsg = {
            key: { remoteJid: `${String(m.from).replace(/\D/g, '')}@s.whatsapp.net`, fromMe: false },
            message: { conversation: m.texto },
          };
          manejarMensaje(fakeMsg);
        }
      } catch (err) {
        console.error('[Whapi] Error procesando webhook:', err.message);
      }
      res.writeHead(200);
      res.end('OK');
      return;
    }

    // Webhook Meta — GET /webhook (verificación)
    if (req.method === 'GET' && req.url?.startsWith('/webhook')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const mode      = params.get('hub.mode');
      const token     = params.get('hub.verify_token');
      const challenge = params.get('hub.challenge');
      const WEBHOOK_TOKEN = process.env.WA_WEBHOOK_SECRET || '';
      if (mode === 'subscribe' && token === WEBHOOK_TOKEN) {
        console.log('[Webhook] Verificación Meta OK');
        res.writeHead(200);
        res.end(challenge);
      } else {
        console.warn('[Webhook] Verificación fallida — token incorrecto');
        res.writeHead(403);
        res.end('Forbidden');
      }
      return;
    }

    // Webhook Meta — POST /webhook (mensajes entrantes)
    if (req.method === 'POST' && req.url === '/webhook') {
      const body = await leerBody(req);
      try {
        const entry   = body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value   = changes?.value;
        const msgs    = value?.messages;
        if (msgs && msgs.length > 0) {
          for (const msg of msgs) {
            const from = msg.from; // número sin @s.whatsapp.net
            const text = msg.text?.body || '';
            if (from && text) {
              console.log(`[Webhook] Mensaje de ${from}: "${text.substring(0, 60)}"`);
              if (_onMessageMeta) _onMessageMeta(from, text);
            }
          }
        }
      } catch (err) {
        console.error('[Webhook] Error procesando mensaje:', err.message);
      }
      res.writeHead(200);
      res.end('OK');
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

module.exports = { iniciarHealthcheck, registrarSender, registrarHandlerMeta };
