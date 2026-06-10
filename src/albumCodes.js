/**
 * Códigos fijos para el álbum «Amigos de las Matemáticas» (rotación por navegador).
 * - CAR-… → lámina «Plano cartesiano» (al completar El Bosque + Las Montañas)
 * - DES-… → lámina «René Descartes» (al completar El Desierto + El Océano)
 */
export const STORAGE_KEY_ALBUM_ISSUE_CAR = 'ctc_album_issue_car';
export const STORAGE_KEY_ALBUM_ISSUE_DES = 'ctc_album_issue_des';

export const ALBUM_SHEET_CAR = 'Plano cartesiano';
export const ALBUM_SHEET_DES = 'René Descartes';

/** Referencia para Excel / docente. */
export const ALBUM_CAR_CODES = [
  'CAR-N9C2-R1S',
  'CAR-K8N3-P7Q',
  'CAR-Q4W8-R3T',
  'CAR-H2J9-L5V',
  'CAR-P8N4-K6R'
];

export const ALBUM_DES_CODES = [
  'DES-F1F5-T4D',
  'DES-A5B2-C8D',
  'DES-W7Y4-Z9K',
  'DES-T3R6-M2N',
  'DES-L8P1-Q4S'
];

export const ALBUM_CODES_REFERENCE = {
  laminaPlanoCartesiano: [...ALBUM_CAR_CODES],
  laminaReneDescartes: [...ALBUM_DES_CODES]
};

/** Pantalla «Modos de juego» del menú principal. */
export const GAME_MODES_SECTIONS = [
  {
    title: 'Campaña',
    body:
      'Aventura en orden: Bosque → Montañas → Desierto → Océano.\n\n' +
      'Cada mapa se desbloquea al completar el anterior. Es la forma recomendada en clase.'
  },
  {
    title: 'Modo libre',
    body:
      'Elegís cualquier mundo cuando quieras. Sirve para repasar o practicar un tema.\n\n' +
      'No entrega códigos del álbum.'
  },
  {
    title: 'Códigos del álbum Amigos de las Matemáticas',
    body:
      'Solo en Campaña:\n\n' +
      '· Código CAR-… (lámina Plano cartesiano) al ganar Las Montañas, con El Bosque ya completado.\n\n' +
      '· Código DES-… (lámina René Descartes) al ganar El Océano, con El Desierto ya completado.',
    note:
      'Anotá cada código tal como lo ves en pantalla: mismas letras, números y guiones. Copialo en tu cuaderno en cuanto aparezca.'
  }
];

function pickNextFixedCode(pool, storageKey) {
  var idx = 0;
  try {
    idx = Number(localStorage.getItem(storageKey) || 0) % pool.length;
  } catch (e) {
    idx = 0;
  }
  var code = pool[idx];
  try {
    localStorage.setItem(storageKey, String(idx + 1));
  } catch (e2) {}
  return code;
}

/** @returns {{ code: string, sheetLabel: string }} */
export function pickAlbumCodeCar() {
  return {
    code: pickNextFixedCode(ALBUM_CAR_CODES, STORAGE_KEY_ALBUM_ISSUE_CAR),
    sheetLabel: ALBUM_SHEET_CAR
  };
}

/** @returns {{ code: string, sheetLabel: string }} */
export function pickAlbumCodeDescartes() {
  return {
    code: pickNextFixedCode(ALBUM_DES_CODES, STORAGE_KEY_ALBUM_ISSUE_DES),
    sheetLabel: ALBUM_SHEET_DES
  };
}

/**
 * Código según la victoria que cierra el par (índ. 1 o 3).
 * @param {number} levelIndex
 */
export function pickAlbumCodeForLevel(levelIndex) {
  if (levelIndex === 1) return pickAlbumCodeCar();
  if (levelIndex === 3) return pickAlbumCodeDescartes();
  return null;
}
