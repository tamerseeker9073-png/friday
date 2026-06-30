const { marcarCompletada } = require('./api');

async function completarTarea(taskId) {
  await marcarCompletada(taskId);
  return true;
}

module.exports = { completarTarea };
