/**
 * Campaña por niveles: desbloqueo lineal, modo libre y códigos del álbum (CAR / DES).
 * Códigos al completar un par de misiones: 1+2 → CAR, 3+4 → DES.
 */
export const STORAGE_KEY_FREE_MODE = 'ctc_free_mode';

/** Victorias en las que puede entregarse código (2.º y 4.º mapa del par). */
export const ALBUM_CODE_TRIGGER_LEVEL_INDICES = [1, 3];

export function readFreeModePref() {
  try {
    return localStorage.getItem(STORAGE_KEY_FREE_MODE) === '1';
  } catch (e) {
    return false;
  }
}

export function writeFreeModePref(on) {
  try {
    localStorage.setItem(STORAGE_KEY_FREE_MODE, on ? '1' : '0');
  } catch (e) {}
}

export function initRegistry(registry) {
  if (!registry) return;
  var free = readFreeModePref();
  if (registry.get('freeMode') == null) registry.set('freeMode', free);
  if (registry.get('levelsCompleted') == null) registry.set('levelsCompleted', {});
  if (registry.get('albumCodesIssued') == null) registry.set('albumCodesIssued', {});
  if (registry.get('albumCodeEligible') == null) registry.set('albumCodeEligible', !free);
}

export function isFreeMode(registry) {
  return !!(registry && registry.get('freeMode'));
}

export function isAlbumCodeEligible(registry) {
  return !!(registry && registry.get('albumCodeEligible'));
}

export function setFreeMode(registry, on, opts) {
  if (!registry) return;
  opts = opts || {};
  writeFreeModePref(!!on);
  registry.set('freeMode', !!on);
  if (on) registry.set('albumCodeEligible', false);
  else if (opts.restoreEligibility) registry.set('albumCodeEligible', true);
}

export function markLevelCompleted(registry, levelIndex) {
  if (!registry || levelIndex == null || levelIndex < 0) return;
  var lc = registry.get('levelsCompleted') || {};
  lc[levelIndex] = true;
  registry.set('levelsCompleted', lc);
}

export function isLevelCompleted(registry, levelIndex) {
  if (!registry || levelIndex == null) return false;
  var lc = registry.get('levelsCompleted') || {};
  return !!lc[levelIndex];
}

export function isLevelUnlocked(registry, levelIndex) {
  if (!registry || levelIndex == null || levelIndex < 0) return false;
  if (isFreeMode(registry)) return true;
  if (levelIndex <= 0) return true;
  return isLevelCompleted(registry, levelIndex - 1);
}

export function resetCampaignProgress(registry) {
  if (!registry) return;
  registry.set('levelsCompleted', {});
  registry.set('albumCodesIssued', {});
  var free = readFreeModePref();
  registry.set('freeMode', free);
  registry.set('albumCodeEligible', !free);
}

/** Nueva partida de campaña desde el menú (modo libre off, elegible a códigos). */
export function startCampaign(registry) {
  writeFreeModePref(false);
  if (!registry) return;
  registry.set('freeMode', false);
  registry.set('albumCodeEligible', true);
  registry.set('levelsCompleted', {});
  registry.set('albumCodesIssued', {});
}

/** Entrada a práctica libre (sin códigos de lámina). */
export function enterFreePractice(registry) {
  writeFreeModePref(true);
  if (!registry) return;
  registry.set('freeMode', true);
  registry.set('albumCodeEligible', false);
}

/** @param {'car'|'des'} key */
export function wasAlbumCodeIssued(registry, key) {
  var issued = (registry && registry.get('albumCodesIssued')) || {};
  return !!issued[key];
}

/** @param {'car'|'des'} key */
export function markAlbumCodeIssued(registry, key) {
  if (!registry || !key) return;
  var issued = registry.get('albumCodesIssued') || {};
  issued[key] = true;
  registry.set('albumCodesIssued', issued);
}

/**
 * Clave del código según la victoria que cierra el par.
 * @param {number} levelIndex 1 = par bosque+montañas, 3 = par desierto+océano
 */
export function albumCodeKeyForLevel(levelIndex) {
  if (levelIndex === 1) return 'car';
  if (levelIndex === 3) return 'des';
  return null;
}

function isPairComplete(registry, firstIdx, secondIdx) {
  return isLevelCompleted(registry, firstIdx) && isLevelCompleted(registry, secondIdx);
}

/**
 * ¿Entregar código en esta victoria? (tras markLevelCompleted del nivel actual.)
 * CAR: al ganar nivel 2 (índ. 1) con nivel 1 ya completado.
 * DES: al ganar nivel 4 (índ. 3) con nivel 3 ya completado.
 */
export function canIssueAlbumCodeForLevel(registry, levelIndex) {
  if (!registry || !isAlbumCodeEligible(registry) || isFreeMode(registry)) return false;
  var key = albumCodeKeyForLevel(levelIndex);
  if (!key || wasAlbumCodeIssued(registry, key)) return false;
  if (levelIndex === 1) return isPairComplete(registry, 0, 1);
  if (levelIndex === 3) return isPairComplete(registry, 2, 3);
  return false;
}

export function lockHintForLevel(levelIndex) {
  var names = ['El Bosque', 'Las Montañas', 'El Desierto'];
  if (levelIndex <= 0) return '';
  var prev = names[levelIndex - 1] || 'el nivel anterior';
  return 'Completá «' + prev + '» para desbloquear este mapa.';
}
