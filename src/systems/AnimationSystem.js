/** @param {Phaser.GameObjects.GameObject} sprite */

function getScalePair(sprite) {
  var sx = typeof sprite.scaleX === 'number' ? sprite.scaleX : 1;
  var sy = typeof sprite.scaleY === 'number' ? sprite.scaleY : 1;
  return { sx: sx, sy: sy };
}

export function animPop(scene, sprite) {
  if (!sprite || !scene || !scene.tweens) return;
  if (!sprite.active || (scene.sys && !scene.sys.isActive())) return;
  var sc = getScalePair(sprite);
  var baseX = sc.sx;
  var baseY = sc.sy;
  scene.tweens.killTweensOf(sprite);
  sprite.setScale(baseX * 0.08, baseY * 0.08);
  scene.tweens.add({
    targets: sprite,
    scaleX: baseX * 1.12,
    scaleY: baseY * 1.12,
    duration: 140,
    ease: 'Back.easeOut',
    onComplete: function () {
      if (!sprite.active || !scene.sys || !scene.sys.isActive()) return;
      scene.tweens.add({
        targets: sprite,
        scaleX: baseX,
        scaleY: baseY,
        duration: 90,
        ease: 'Sine.easeOut'
      });
    }
  });
}

export function animBounce(scene, sprite) {
  if (!sprite || !scene || !scene.tweens) return;
  if (!sprite.active || (scene.sys && !scene.sys.isActive())) return;
  var sc = getScalePair(sprite);
  scene.tweens.add({
    targets: sprite,
    scaleX: sc.sx * 1.05,
    scaleY: sc.sy * 0.97,
    duration: 90,
    yoyo: true,
    ease: 'Sine.easeInOut',
    repeat: 1,
    onUpdate: function (tw) {
      if (!sprite.active) {
        try {
          tw.stop();
        } catch (e) {}
      }
    }
  });
}

export function animShake(scene, sprite) {
  if (!sprite || !scene || !scene.tweens) return;
  if (!sprite.active || (scene.sys && !scene.sys.isActive())) return;
  var ox = sprite.x;
  var oy = sprite.y;
  scene.tweens.add({
    targets: sprite,
    x: ox + 6,
    duration: 40,
    yoyo: true,
    repeat: 5,
    ease: 'Sine.easeInOut',
    onComplete: function () {
      if (sprite && sprite.active) sprite.setPosition(ox, oy);
    },
    onUpdate: function (tw) {
      if (!sprite.active) {
        try {
          tw.stop();
        } catch (e) {}
      }
    }
  });
}

export function animPulse(scene, sprite) {
  if (!sprite || !scene || !scene.tweens) return;
  if (!sprite.active || (scene.sys && !scene.sys.isActive())) return;
  var sc = getScalePair(sprite);
  scene.tweens.add({
    targets: sprite,
    scaleX: sc.sx * 1.08,
    scaleY: sc.sy * 1.08,
    duration: 200,
    yoyo: true,
    ease: 'Sine.easeInOut',
    onUpdate: function (tw) {
      if (!sprite.active) {
        try {
          tw.stop();
        } catch (e) {}
      }
    }
  });
}

/**
 * Pulso periódico estilo móvil (cada intervalo ms).
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} sprite
 * @param {number} [minMs]
 * @param {number} [maxMs]
 */
export function animPulseEvery(scene, sprite, minMs, maxMs) {
  if (!sprite || !scene) return;
  var lo = minMs != null ? minMs : 2000;
  var hi = maxMs != null ? maxMs : 3000;
  var run = function () {
    if (!sprite.active || !scene.sys || !scene.sys.isActive()) return;
    animPulse(scene, sprite);
    var d = Phaser.Math.Between(lo, hi);
    if (scene.time) scene.time.delayedCall(d, run);
  };
  scene.time.delayedCall(Phaser.Math.Between(lo, hi), run);
}

export function animFadeIn(scene, sprite, duration) {
  if (!sprite || !scene || !scene.tweens) return;
  if (!sprite.active || (scene.sys && !scene.sys.isActive())) return;
  var d = duration != null ? duration : 300;
  sprite.setAlpha(0);
  scene.tweens.add({
    targets: sprite,
    alpha: 1,
    duration: d,
    ease: 'Sine.easeOut',
    onUpdate: function (tw) {
      if (!sprite.active) {
        try {
          tw.stop();
        } catch (e) {}
      }
    }
  });
}

export function animFadeOut(scene, sprite, duration, onComplete) {
  if (!sprite || !scene || !scene.tweens) return;
  if (!sprite.active || (scene.sys && !scene.sys.isActive())) return;
  var d = duration != null ? duration : 300;
  scene.tweens.add({
    targets: sprite,
    alpha: 0,
    duration: d,
    ease: 'Sine.easeIn',
    onComplete: function () {
      if (typeof onComplete === 'function') onComplete();
    },
    onUpdate: function (tw) {
      if (!sprite.active) {
        try {
          tw.stop();
        } catch (e) {}
      }
    }
  });
}

export function animSlideIn(scene, sprite, from) {
  if (!sprite || !scene || !scene.tweens) return;
  if (!sprite.active || (scene.sys && !scene.sys.isActive())) return;
  if (!scene.cameras || !scene.cameras.main) return;
  var dir = from != null ? from : 'left';
  var w = scene.cameras.main.width;
  var ox = sprite.x;
  var oy = sprite.y;
  var dx = dir === 'right' ? w * 0.35 : dir === 'left' ? -w * 0.35 : 0;
  var dy = dir === 'up' ? -scene.cameras.main.height * 0.2 : dir === 'down' ? scene.cameras.main.height * 0.2 : 0;
  sprite.setPosition(ox + dx, oy + dy);
  sprite.setAlpha(0);
  scene.tweens.add({
    targets: sprite,
    x: ox,
    y: oy,
    alpha: 1,
    duration: 380,
    ease: 'Cubic.easeOut'
  });
}
