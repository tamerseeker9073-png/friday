const NIVELES = {
  owner: 5,       // Financial data access — Pato Barsante + Fran Repanic only
  admin: 4,
  supervisor: 3,
  colaborador: 2,
  unknown: 0,
};

const RECURSOS = {
  datos_financieros: ['owner'],
  todos_colaboradores: ['owner', 'admin', 'supervisor'],
  tareas_propias: ['owner', 'admin', 'supervisor', 'colaborador'],
  info_clientes: ['owner', 'admin', 'supervisor', 'colaborador'],
  prompts: ['owner', 'admin', 'supervisor', 'colaborador'],
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
  return nivel === 'admin' || nivel === 'owner';
}

function esSupervisor(nivel) {
  return nivel === 'supervisor' || nivel === 'admin' || nivel === 'owner';
}

module.exports = { getNivel, puedeAcceder, esAdmin, esSupervisor };
