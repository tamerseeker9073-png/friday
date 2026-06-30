const NIVELES = {
  admin: 4,
  supervisor: 3,
  colaborador: 2,
  unknown: 0,
};

const RECURSOS = {
  datos_financieros: ['admin'],
  todos_colaboradores: ['admin', 'supervisor'],
  tareas_propias: ['admin', 'supervisor', 'colaborador'],
  info_clientes: ['admin', 'supervisor', 'colaborador'],
  prompts: ['admin', 'supervisor', 'colaborador'],
};

function getNivel(colaborador) {
  if (!colaborador) return 'unknown';
  return colaborador.nivel || 'colaborador';
}

function puedeAcceder(nivel, recurso) {
  const autorizados = RECURSOS[recurso];
  if (!autorizados) return false;
  return autorizados.includes(nivel);
}

function esAdmin(nivel) {
  return nivel === 'admin';
}

function esSupervisor(nivel) {
  return nivel === 'supervisor' || nivel === 'admin';
}

module.exports = { getNivel, puedeAcceder, esAdmin, esSupervisor };
