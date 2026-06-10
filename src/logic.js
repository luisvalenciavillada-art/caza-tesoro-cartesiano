function tryCreateAudio(url) {
  try {
    return new Audio(url);
  } catch (e) {
    return null;
  }
}

var audioCorrect = tryCreateAudio('assets/ui/correct.wav');
var audioWrong = tryCreateAudio('assets/ui/wrong.wav');
var audioTreasure = tryCreateAudio('assets/ui/treasure.wav');
var audioStep = tryCreateAudio('assets/ui/paso.mp3');

/** Lo registra `game.js` (Phaser); efectos cortos UI van por Audio nativo (respeta mute vía registerMuteStateGetter). */
var muteStateGetter = function () {
  return false;
};

export function registerMuteStateGetter(fn) {
  muteStateGetter = typeof fn === 'function' ? fn : function () { return false; };
}

function isAudioUsable(a) {
  if (!a || typeof a.play !== 'function') return false;
  if (a.error && a.error.code) return false;
  if (typeof a.networkState === 'number' && a.networkState === 3) return false;
  return true;
}

function playAudioSafe(a) {
  if (muteStateGetter()) return;
  if (!isAudioUsable(a)) return;
  try {
    var p = a.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  } catch (e) {}
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDecimal(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function generateCoordinate(levelId) {
  var level = window.LEVELS.find(l => l.id === levelId);
  var x = level.decimals ? randomDecimal(level.xMin, level.xMax) : randomInt(level.xMin, level.xMax);
  var y = level.decimals ? randomDecimal(level.yMin, level.yMax) : randomInt(level.yMin, level.yMax);
  return { x, y };
}

function checkMatch(x, y, target) {
  var decimal = String(target.x).includes('.') || String(target.y).includes('.');
  if (decimal) return Math.abs(x - target.x) < 0.25 && Math.abs(y - target.y) < 0.25;
  return x === target.x && y === target.y;
}

/** @param {{ x: number, y: number }} pos */
/** @param {'arriba'|'abajo'|'izquierda'|'derecha'} direccion */
export function moverPersonaje(pos, direccion) {
  var x = pos.x;
  var y = pos.y;
  if (direccion === 'arriba') y += 1;
  else if (direccion === 'abajo') y -= 1;
  else if (direccion === 'izquierda') x -= 1;
  else if (direccion === 'derecha') x += 1;
  return { x: x, y: y };
}

export function llegoAlTesoro(pos, tesoro) {
  return pos.x === tesoro.x && pos.y === tesoro.y;
}

export function hayColision(pos, objetos) {
  if (!objetos || !objetos.length) return false;
  return objetos.some(function (o) {
    return o.x === pos.x && o.y === pos.y;
  });
}

/**
 * Métricas del plano cartesiano del nivel (rejilla = xMax−xMin+1, etc.).
 * @param {object} level
 */
export function getPlaneMetrics(level) {
  if (!level) {
    return { xMin: 0, yMin: 0, xMax: 7, yMax: 7, ancho: 8, alto: 8 };
  }
  var xMin = level.xMin != null ? level.xMin : 0;
  var yMin = level.yMin != null ? level.yMin : 0;
  var xMax =
    level.xMax != null
      ? level.xMax
      : xMin + (level.anchoMapa != null ? level.anchoMapa : 8) - 1;
  var yMax =
    level.yMax != null
      ? level.yMax
      : yMin + (level.altoMapa != null ? level.altoMapa : 8) - 1;
  return {
    xMin: xMin,
    yMin: yMin,
    xMax: xMax,
    yMax: yMax,
    ancho: xMax - xMin + 1,
    alto: yMax - yMin + 1
  };
}

/** Convierte coordenada cartesiana del juego a índices de rejilla (0…ancho−1). */
export function cartToGrid(level, x, y) {
  var m = getPlaneMetrics(level);
  return { gx: x - m.xMin, gy: y - m.yMin };
}

/** Convierte índices de rejilla a coordenada cartesiana. */
export function gridToCart(level, gx, gy) {
  var m = getPlaneMetrics(level);
  return { x: m.xMin + gx, y: m.yMin + gy };
}

/** Límites inclusivos en coordenadas cartesianas (eje Y hacia arriba). */
export function fueraDelMapa(pos, levelOrAncho, altoMaybe) {
  if (levelOrAncho && typeof levelOrAncho === 'object' && levelOrAncho.xMin != null) {
    var m = getPlaneMetrics(levelOrAncho);
    return pos.x < m.xMin || pos.y < m.yMin || pos.x > m.xMax || pos.y > m.yMax;
  }
  var ancho = levelOrAncho;
  return pos.x < 0 || pos.y < 0 || pos.x >= ancho || pos.y >= altoMaybe;
}

export function siguienteNivel(nivelActual, levelsArr) {
  if (!nivelActual || !levelsArr || !levelsArr.length) return null;
  var idx = levelsArr.findIndex(function (l) {
    return l.id === nivelActual.id;
  });
  if (idx < 0 || idx >= levelsArr.length - 1) return null;
  return levelsArr[idx + 1];
}

export {
  playAudioSafe,
  isAudioUsable,
  generateCoordinate,
  checkMatch,
  audioCorrect,
  audioWrong,
  audioTreasure,
  audioStep
};
