/**
 * Partículas y recompensas visuales (texturas runtime __px* no forman parte del preload de assets).
 */
import { ensureMedalFrames, getMedalFrameForLevel } from '../medals.js';

function ensureDotTexture(scene, key, color, radius) {
  if (scene.textures.exists(key)) return;
  var r = radius != null ? radius : 5;
  var s = r * 2 + 2;
  var g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(color, 1);
  g.fillCircle(s / 2, s / 2, r);
  g.generateTexture(key, s, s);
  g.destroy();
}

/**
 * Chispas suaves alrededor del cofre mientras el nivel está activo.
 * @returns {Phaser.GameObjects.Particles.ParticleEmitter|null}
 */
export function createTesoroBrilloAmbient(scene, x, y) {
  if (!scene || !scene.add) return null;
  ensureDotTexture(scene, '__pxSpark', 0xffe066, 3);
  try {
    var em = scene.add.particles(x, y, '__pxSpark', {
      speed: { min: 10, max: 38 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 380, max: 820 },
      scale: { start: 0.42, end: 0 },
      alpha: { start: 0.85, end: 0 },
      frequency: 150,
      quantity: 1,
      blendMode: 'ADD',
      emitting: true
    });
    em.setDepth(5);
    return em;
  } catch (e) {
    return null;
  }
}

/**
 * Ajusta brillo según distancia Manhattan en celdas (jugador ↔ tesoro).
 * @param {Phaser.GameObjects.Particles.ParticleEmitter|null} emitter
 * @param {number} distManhattan
 */
export function setTesoroBrilloIntensidad(emitter, distManhattan) {
  if (!emitter || !emitter.active || emitter.scene == null) return;
  var d = distManhattan != null ? distManhattan : 999;
  var freq;
  var q;
  if (d <= 1) {
    freq = 52;
    q = 2;
  } else if (d <= 3) {
    freq = 92;
    q = 1;
  } else {
    freq = 168;
    q = 1;
  }
  try {
    if (typeof emitter.setFrequency === 'function') emitter.setFrequency(freq);
    else emitter.frequency = freq;
    if (typeof emitter.setQuantity === 'function') emitter.setQuantity(q);
    else emitter.quantity = q;
  } catch (e) {}
}

function getEmitter(scene, x, y, config) {
  ensureDotTexture(scene, '__pxGold', 0xffd700, 5);
  ensureDotTexture(scene, '__pxRed', 0xef4444, 4);
  ensureDotTexture(scene, '__pxDust', 0xc4b5a0, 3);
  var key = config.textureKey || '__pxGold';
  var emitter = scene.add.particles(x, y, key, {
    speed: config.speed || { min: 40, max: 180 },
    angle: config.angle || { min: 0, max: 360 },
    scale: config.scale || { start: 0.6, end: 0 },
    lifespan: config.lifespan || 500,
    blendMode: 'ADD',
    emitting: false
  });
  emitter.setDepth(config.depth != null ? config.depth : 1500);
  return emitter;
}

/** Dorado al encontrar el tesoro */
export function efectoTesoro(scene, x, y) {
  if (!scene || !scene.add) return;
  try {
    var em = getEmitter(scene, x, y, {
      textureKey: '__pxGold',
      speed: { min: 80, max: 260 },
      lifespan: 650,
      scale: { start: 0.9, end: 0 }
    });
    if (em && typeof em.explode === 'function') em.explode(32);
    scene.time.delayedCall(700, function () {
      if (!scene.sys || !scene.sys.isActive()) return;
      if (em && em.destroy) em.destroy();
    });
  } catch (e) {
    /* sin partículas en este entorno */
  }
}

/** Chispas rojas al fallar */
export function efectoError(scene, x, y) {
  if (!scene || !scene.add) return;
  try {
    var em = getEmitter(scene, x, y, {
      textureKey: '__pxRed',
      speed: { min: 60, max: 200 },
      lifespan: 450,
      scale: { start: 0.8, end: 0 },
      angle: { min: 200, max: 340 }
    });
    if (em && typeof em.explode === 'function') em.explode(24);
    scene.time.delayedCall(550, function () {
      if (!scene.sys || !scene.sys.isActive()) return;
      if (em && em.destroy) em.destroy();
    });
  } catch (e) {}
}

/** Confeti + monedas que saltan (usa textura ya precargada si existe) */
export function efectoConfeti(scene) {
  if (!scene || !scene.add) return;
  var w = scene.cameras.main.width;
  var h = scene.cameras.main.height;
  ensureDotTexture(scene, '__pxConf', 0xffffff, 4);
  try {
    var em = scene.add.particles(w / 2, h * 0.18, '__pxConf', {
      speed: { min: 140, max: 320 },
      angle: { min: 210, max: 330 },
      lifespan: 1100,
      scale: { start: 0.85, end: 0.05 },
      blendMode: 'ADD',
      emitting: false
    });
    em.setDepth(1600);
    if (em && typeof em.explode === 'function') em.explode(48);
    scene.time.delayedCall(1200, function () {
      if (!scene.sys || !scene.sys.isActive()) return;
      if (em && em.destroy) em.destroy();
    });
  } catch (e) {}

  if (scene.textures.exists('stickerMedallasPuntos')) {
    ensureMedalFrames(scene, 4);
    var cx = w / 2;
    var cy = h * 0.45;
    var medalFrame =
      scene.levelIndex != null ? getMedalFrameForLevel(scene.levelIndex) : 0;
    for (var i = 0; i < 10; i++) {
      (function () {
        var coin = scene.add.image(cx, cy, 'stickerMedallasPuntos', medalFrame);
        var base = Math.min(32 / coin.width, 32 / coin.height, 0.35);
        coin.setScale(base * 0.3);
        coin.setDepth(1650);
        var tx = cx + Phaser.Math.Between(-140, 140);
        var ty = cy - Phaser.Math.Between(80, 200);
        scene.tweens.add({
          targets: coin,
          x: tx,
          y: ty,
          scale: base,
          angle: Phaser.Math.Between(-40, 40),
          duration: 650,
          ease: 'Cubic.easeOut',
          onComplete: function () {
            if (!coin || !coin.active || !scene.sys || !scene.sys.isActive()) return;
            scene.tweens.add({
              targets: coin,
              alpha: 0,
              y: ty + 40,
              duration: 350,
              delay: 200,
              onComplete: function () {
                if (coin && coin.active) coin.destroy();
              }
            });
          }
        });
      })();
    }
  }
}

/**
 * Polvo al moverse; `direccion` orienta el chorro hacia atrás del desplazamiento.
 * @param {'arriba'|'abajo'|'izquierda'|'derecha'} [direccion]
 */
export function efectoMovimiento(scene, x, y, direccion) {
  if (!scene || !scene.add) return;
  var angleMin = 250;
  var angleMax = 290;
  var speedMin = 35;
  var speedMax = 120;
  if (direccion === 'arriba') {
    angleMin = 200;
    angleMax = 250;
  } else if (direccion === 'abajo') {
    angleMin = 290;
    angleMax = 340;
  } else if (direccion === 'izquierda') {
    angleMin = 320;
    angleMax = 40;
  } else if (direccion === 'derecha') {
    angleMin = 140;
    angleMax = 200;
  }
  try {
    var em = getEmitter(scene, x, y, {
      textureKey: '__pxDust',
      speed: { min: speedMin, max: speedMax },
      lifespan: 380,
      scale: { start: 0.65, end: 0 },
      angle: { min: angleMin, max: angleMax }
    });
    if (em && typeof em.explode === 'function') em.explode(14);
    scene.time.delayedCall(450, function () {
      if (!scene.sys || !scene.sys.isActive()) return;
      if (em && em.destroy) em.destroy();
    });
  } catch (e) {}
}


/**
 * Niebla suave junto al Secuaz / moscas (nivel 2).
 * Usamos círculos nativos (sin textura generada): en algunos navegadores/WebGL
 * __pxFogPuff quedaba invisible; los Arc siempre se dibujan.
 */
export function createSecuazFogCluster(scene, cellCenterFn, anchors, cellSize) {
  if (!scene || !scene.add || !anchors || !anchors.length) return null;
  var container = scene.add.container(0, 0);
  container.setName('ctcSecuazFogRoot');
  /* Sobre rejilla (~3), bajo Penny (16). */
  container.setDepth(15);
  var puffs = [];
  var cs = cellSize > 0 ? cellSize : 40;

  anchors.forEach(function (a) {
    var c = cellCenterFn(a.x, a.y);
    var offsets = [
      { dx: 0, dy: 0, sc: 1.45 },
      { dx: cs * 0.32, dy: -cs * 0.2, sc: 1.2 },
      { dx: -cs * 0.28, dy: cs * 0.18, sc: 1.1 },
      { dx: cs * 0.12, dy: cs * 0.22, sc: 1.0 },
      { dx: -cs * 0.15, dy: -cs * 0.25, sc: 0.95 }
    ];
    offsets.forEach(function (off, oi) {
      var cx = c.x + off.dx;
      var cy = c.y + off.dy;
      var rad = Math.max(cs * 0.28, 10) * off.sc;
      var fillA = 0.38 + oi * 0.05;
      var circ = scene.add.circle(cx, cy, rad, 0xe8f4fc, fillA);
      circ.setStrokeStyle(Math.max(1, Math.floor(cs * 0.04)), 0xffffff, 0.4);
      try {
        circ.setBlendMode(Phaser.BlendModes.SCREEN);
      } catch (eB) {}
      circ.setData('ctcFogPuff', true);
      container.add(circ);
      puffs.push(circ);
      if (scene.tweens) {
        scene.tweens.add({
          targets: circ,
          x: cx + Phaser.Math.Between(-Math.floor(cs * 0.12), Math.floor(cs * 0.12)),
          y: cy + Phaser.Math.Between(-Math.floor(cs * 0.1), Math.floor(cs * 0.1)),
          alpha: { from: fillA, to: Math.min(0.65, fillA + 0.2) },
          duration: Phaser.Math.Between(2400, 3600),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    });
  });

  return { container: container, puffs: puffs };
}

/** Elimina al instante cualquier puff de niebla del Secuaz en escena. */
export function purgeSecuazFogSprites(scene) {
  if (!scene) return;
  var killFog = function (o) {
    if (!o) return;
    var key = o.texture && o.texture.key;
    var isRoot = o.name === 'ctcSecuazFogRoot';
    var isArcPuff = !!(o.getData && o.getData('ctcFogPuff'));
    if (!isRoot && key !== '__pxFogPuff' && !isArcPuff) return;
    if (scene.tweens) scene.tweens.killTweensOf(o);
    try {
      if (isRoot && o.destroy) o.destroy(true);
      else if (o.active && o.destroy) o.destroy();
    } catch (eK) {}
  };
  var walk = function (node) {
    if (!node || !node.active) return;
    if (node.name === 'ctcSecuazFogRoot') {
      killFog(node);
      return;
    }
    if (node.texture && node.texture.key === '__pxFogPuff') {
      killFog(node);
      return;
    }
    if (node.getData && node.getData('ctcFogPuff')) {
      killFog(node);
      return;
    }
    var kids = node.list;
    if (kids && kids.length) {
      for (var i = kids.length - 1; i >= 0; i--) walk(kids[i]);
    }
  };
  if (scene.children && scene.children.list) {
    scene.children.list.slice().forEach(walk);
  }
}

/** Expande y desvanece la niebla del Secuaz. */
export function dispelSecuazFog(scene, puffs, onDone, opts) {
  opts = opts || {};
  if (!scene || !puffs || !puffs.length) {
    if (onDone) onDone();
    return;
  }
  var pending = 0;
  puffs.forEach(function (p) {
    if (p && p.active) pending += 1;
  });
  if (!pending) {
    if (onDone) onDone();
    return;
  }
  var lento = !!opts.lento;
  var durBase = lento ? 4200 : 2600;
  var durStep = lento ? 220 : 130;
  var delayStep = lento ? 160 : 100;
  var left = pending;
  puffs.forEach(function (p, i) {
    if (!p || !p.active) return;
    if (scene.tweens) scene.tweens.killTweensOf(p);
    scene.tweens.add({
      targets: p,
      scaleX: p.scaleX * (lento ? 2.2 : 2.7),
      scaleY: p.scaleY * (lento ? 2.0 : 2.5),
      alpha: 0,
      x: p.x + Phaser.Math.Between(-Math.floor(i * 14) - 8, Math.floor(i * 14) + 8),
      y: p.y + Phaser.Math.Between(-10, 14),
      duration: durBase + i * durStep,
      delay: i * delayStep,
      ease: lento ? 'Sine.easeInOut' : 'Quad.easeOut',
      onComplete: function () {
        try {
          p.destroy();
        } catch (eD) {}
        left -= 1;
        if (left <= 0 && onDone) onDone();
      }
    });
  });
}
