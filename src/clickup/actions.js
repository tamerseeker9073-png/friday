const { cambiarStatus } = require('./api');

async function completarTarea(taskId) {
  await cambiarStatus(taskId, 'revisión');
  return taskId;
}

module.exports = { completarTarea };
