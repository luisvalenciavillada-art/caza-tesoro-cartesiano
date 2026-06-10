/**
 * Medallas por nivel (genéricas, sin número impreso en el arte).
 * Color fijo por mundo; la calidad la marca el tier según ⭐ del nivel.
 */
import * as Anim from './systems/AnimationSystem.js';

function tierThresholds() {
  var r =
    typeof window !== 'undefined' && window.MEDAL_RULES ? window.MEDAL_RULES : null;
  return {
    tres: r && r.tierTres != null ? r.tierTres : MEDAL_TIER_THRESHOLDS.tres,
    dos: r && r.tierDos != null ? r.tierDos : MEDAL_TIER_THRESHOLDS.dos,
    uno: r && r.tierUno != null ? r.tierUno : MEDAL_TIER_THRESHOLDS.uno
  };
}

/** Orden en sticker_medallas_puntos.png (izq → der): amarilla, azul, verde, roja. */
export const MEDAL_SPRITE_ORDER = ['amarilla', 'azul', 'verde', 'roja'];

/** Índice de frame en el spritesheet para cada nivel (0–3). */
export const MEDAL_FRAME_BY_LEVEL = [
  0, /* 1 Bosque → amarilla/dorada */
  2, /* 2 Montañas → verde */
  3, /* 3 Desierto → roja */
  1 /* 4 Océano → azul */
];

export const MEDAL_LEVEL_NAMES = ['El Bosque', 'Las Montañas', 'El Desierto', 'El Océano'];

/** Fracción del máximo de estrellas del nivel → tier (0–3 estrellitas de brillo). */
export const MEDAL_TIER_THRESHOLDS = {
  tres: 0.9,
  dos: 0.7,
  uno: 0.5
};

export const MEDAL_TIER_LABELS = [
  '¡Medalla conseguida!',
  'Buen explorador',
  'Muy buen cartógrafo',
  '¡Excelencia en el plano!'
];

/**
 * Máximo teórico de ⭐ en un nivel (preguntas a la primera + cofre + bono eficiencia).
 */
export function computeMaxStarsForLevel(level) {
  if (!level) return 50;
  var rules = typeof window !== 'undefined' && window.SCORE_RULES ? window.SCORE_RULES : {};
  var perQ = rules.preguntaCorrectaPrimera != null ? rules.preguntaCorrectaPrimera : 10;
  var cofre = rules.llegadaCofre != null ? rules.llegadaCofre : 30;
  var bono = rules.bonoEficiencia != null ? rules.bonoEficiencia : 10;
  var n = 0;
  var tareas = level.tareas || [];
  for (var i = 0; i < tareas.length; i++) {
    if (tareas[i].pregunta) n++;
  }
  var preguntas = level.preguntas || [];
  n += preguntas.length;
  if (n === 0) n = 1;
  return n * perQ + cofre + bono;
}

export function computeMedalTier(stars, maxStars) {
  if (stars == null || stars < 0) stars = 0;
  if (maxStars == null || maxStars <= 0) maxStars = 50;
  if (stars <= 0) return 0;
  var ratio = stars / maxStars;
  var th = tierThresholds();
  if (ratio >= th.tres) return 3;
  if (ratio >= th.dos) return 2;
  if (ratio >= th.uno) return 1;
  return 0;
}

/**
 * Parte los 4 motivos en frames (si el PNG es una fila horizontal).
 */
export function ensureMedalFrames(scene, frameCount) {
  if (!scene || !scene.textures || !scene.textures.exists('stickerMedallasPuntos')) return false;
  var key = 'stickerMedallasPuntos';
  var tex = scene.textures.get(key);
  if (!tex || !tex.source || !tex.source[0]) return false;
  var src = tex.source[0];
  var w = src.width;
  var h = src.height;
  var n = frameCount != null ? frameCount : 4;
  if (n < 1) n = 4;
  var existing = tex.getFrameNames(false);
  if (existing.length >= n) return true;
  var fw = Math.floor(w / n);
  if (fw < 1) return false;
  for (var i = 0; i < n; i++) {
    if (!tex.has(i)) {
      tex.add(i, 0, i * fw, 0, fw, h);
    }
  }
  return true;
}

export function getMedalFrameForLevel(levelIndex) {
  var idx = levelIndex != null ? levelIndex : 0;
  if (idx < 0 || idx >= MEDAL_FRAME_BY_LEVEL.length) return 0;
  return MEDAL_FRAME_BY_LEVEL[idx];
}

/**
 * Guarda la medalla del nivel si es nueva o mejor tier / más estrellas.
 */
export function updateMedalForLevel(registry, levelIndex, level) {
  if (!registry) return null;
  var perLevel = registry.get('starsPerLevel') || {};
  var stars = perLevel[levelIndex] != null ? perLevel[levelIndex] : 0;
  var maxStars = computeMaxStarsForLevel(level);
  var tier = computeMedalTier(stars, maxStars);
  var medals = registry.get('medalsPerLevel') || {};
  var prev = medals[levelIndex];
  var entry = {
    tier: tier,
    stars: stars,
    maxStars: maxStars,
    earnedAt: Date.now()
  };
  if (
    !prev ||
    tier > (prev.tier || 0) ||
    (tier === (prev.tier || 0) && stars > (prev.stars || 0))
  ) {
    medals[levelIndex] = entry;
    registry.set('medalsPerLevel', medals);
  }
  return medals[levelIndex] || entry;
}

export function getMedalEntry(registry, levelIndex) {
  if (!registry) return null;
  var medals = registry.get('medalsPerLevel') || {};
  return medals[levelIndex] || null;
}

export function resetMedalProgress(registry) {
  if (!registry) return;
  registry.set('medalsPerLevel', {});
}

/**
 * Muestra la medalla del nivel (Phaser Image o Sprite) + estrellitas de tier.
 */
export function showMedalGraphic(scene, x, y, levelIndex, tier, opts) {
  opts = opts || {};
  if (!scene || !scene.add) return null;
  var depth = opts.depth != null ? opts.depth : 10;
  var targetH = opts.height != null ? opts.height : Math.min(scene.cameras.main.height * 0.12, 88);
  var container = scene.add.container(x, y);
  container.setDepth(depth);
  container.setScrollFactor(0);

  if (!scene.textures.exists('stickerMedallasPuntos')) {
    var fallback = scene.add
      .text(0, 0, '🏅', { fontSize: Math.round(targetH * 0.9) + 'px' })
      .setOrigin(0.5);
    container.add(fallback);
    return container;
  }

  ensureMedalFrames(scene, 4);
  var frame = getMedalFrameForLevel(levelIndex);
  var img = scene.add.image(0, 0, 'stickerMedallasPuntos', frame);
  var scale = targetH / (img.height || targetH);
  img.setScale(scale);
  if (tier === 0) img.setAlpha(0.88);
  else img.setAlpha(1);
  container.add(img);

  if (opts.points != null && isFinite(opts.points)) {
    var pts = Math.max(0, Math.round(opts.points));
    var digits = String(pts).length;
    var fontPx = Math.round(targetH * (digits >= 3 ? 0.2 : digits === 2 ? 0.26 : 0.3));
    fontPx = Math.max(14, Math.min(fontPx, 36));
    var scoreTxt = scene.add
      .text(0, -targetH * 0.04, String(pts), {
        fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: fontPx + 'px',
        color: '#4a2c0f',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    scoreTxt.setStroke('#fffef8', Math.max(3, Math.round(fontPx * 0.14)));
    container.add(scoreTxt);
  }

  if (tier > 0) {
    var starStr = '';
    for (var s = 0; s < tier; s++) starStr += '⭐';
    var starTxt = scene.add
      .text(0, targetH * 0.48, starStr, {
        fontFamily: 'system-ui, Arial, sans-serif',
        fontSize: Math.max(12, Math.round(targetH * 0.2)) + 'px'
      })
      .setOrigin(0.5, 0);
    starTxt.setStroke('#1a0c08', 3);
    container.add(starTxt);
  }

  if (opts.pop !== false) {
    try {
      Anim.animPop(scene, container);
    } catch (e) {}
  }

  return container;
}
