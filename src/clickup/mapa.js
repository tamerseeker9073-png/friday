// Static map of Social Media space clients → list IDs.
// Avoids API calls when resolving client/type combinations.
// Space IDs are kept here for reference; SM Motos and Meta Ads are resolved dynamically.

const SOCIAL_MEDIA_SPACE_ID = '90138654326';
const SM_MOTOS_SPACE_ID = '901313721071';
const META_ADS_SPACE_ID = '90138868187';

// Social Media — keyed by normalised client name (lowercase, no accents)
// Each client has: reels, flyers, cm (community manager) list IDs.
// cm === null means that client has no CM list.
const CLIENTES_SOCIAL_MEDIA = {
  'repanic': {
    alias: ['repanic', 'repanic&barsante', 'r&b', 'estudio'],
    reels:  '901317223064',
    flyers: '901317223067',
    cm:     '901323895567',
  },
  'grosso': {
    alias: ['grosso', 'grosso automotores'],
    reels:  '901321312641',
    flyers: '901321212949',
    cm:     '901321289932',
  },
  'centrovm': {
    alias: ['centrovm', 'centro vm', 'centro'],
    reels:  '901321110386',
    flyers: '901321110384',
    cm:     '901323895436',
  },
  'austral': {
    alias: ['austral', 'austral automotores'],
    reels:  '901326579163',
    flyers: '901326579164',
    cm:     '901326579166',
  },
  'motomel': {
    alias: ['motomel'],
    reels:  '901325922717',
    flyers: '901325922730',
    cm:     '901325922737',
  },
  'fausol': {
    alias: ['fausol'],
    reels:  '901327480820',
    flyers: '901327480819',
    cm:     '901327480822',
  },
  'benelli': {
    alias: ['benelli'],
    reels:  '901324433024',
    flyers: '901324433042',
    cm:     '901324433044',
  },
  'autohaus rio iii': {
    alias: ['autohaus rio iii', 'autohaus iii', 'rio iii', 'autohaus 3'],
    reels:  '901316700320',
    flyers: '901316700321',
    cm:     null,
  },
  'autohaus rio iv': {
    alias: ['autohaus rio iv', 'autohaus iv', 'rio iv', 'autohaus 4'],
    reels:  '901316700279',
    flyers: '901317224109',
    cm:     null,
  },
};

// Piece-type normalisation → list key
// Anything not matching reels or cm defaults to 'flyers'.
const TIPO_A_KEY = {
  reel:      'reels',
  reels:     'reels',
  video:     'reels',
  videos:    'reels',
  flyer:     'flyers',
  flyers:    'flyers',
  historia:  'flyers',
  historias: 'flyers',
  history:   'flyers',
  stories:   'flyers',
  story:     'flyers',
  carrusel:  'flyers',
  carrousel: 'flyers',
  carousel:  'flyers',
  post:      'flyers',
  posts:     'flyers',
  cm:        'cm',
  community: 'cm',
};

/**
 * Resolve a free-text client name to its map entry.
 * Returns the entry object or null.
 */
function resolverCliente(nombreTexto) {
  if (!nombreTexto) return null;
  const needle = nombreTexto.toLowerCase().trim();
  for (const [, entry] of Object.entries(CLIENTES_SOCIAL_MEDIA)) {
    if (entry.alias.some(a => needle.includes(a) || a.includes(needle))) {
      return entry;
    }
  }
  return null;
}

/**
 * Resolve a piece-type word to a list key ('reels' | 'flyers' | 'cm').
 * Returns null if the word is unrecognised.
 */
function resolverTipoKey(palabra) {
  if (!palabra) return null;
  return TIPO_A_KEY[palabra.toLowerCase().trim()] || null;
}

/**
 * Given a resolved client entry and a type key, return the list ID or null.
 */
function getListaId(clienteEntry, tipoKey) {
  if (!clienteEntry || !tipoKey) return null;
  return clienteEntry[tipoKey] || null;
}

/**
 * List all client display names (for messages to the user).
 */
function nombresClientes() {
  return Object.keys(CLIENTES_SOCIAL_MEDIA).map(k =>
    CLIENTES_SOCIAL_MEDIA[k].alias[0]
  );
}

module.exports = {
  SOCIAL_MEDIA_SPACE_ID,
  SM_MOTOS_SPACE_ID,
  META_ADS_SPACE_ID,
  CLIENTES_SOCIAL_MEDIA,
  TIPO_A_KEY,
  resolverCliente,
  resolverTipoKey,
  getListaId,
  nombresClientes,
};
