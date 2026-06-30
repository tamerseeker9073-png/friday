const Anthropic = require('@anthropic-ai/sdk');

let clienteAnthropic = null;

function getCliente() {
  if (!clienteAnthropic) {
    clienteAnthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return clienteAnthropic;
}

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

async function generarTexto(systemPrompt, userMessage, maxTokens = 1024) {
  const client = getCliente();
  const msg = await client.messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  return msg.content[0]?.text || '';
}

async function generarConHistorial(systemPrompt, historial, maxTokens = 1024) {
  const client = getCliente();
  const msg = await client.messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: historial,
  });
  return msg.content[0]?.text || '';
}

module.exports = { generarTexto, generarConHistorial };
