/**
 * Limpia efectos de cámara antes de animar (evita pantalla negra entre escenas).
 * @param {Phaser.Scene} scene
 */
export function prepareSceneCamera(scene) {
  if (!scene || !scene.cameras || !scene.cameras.main) return;
  try {
    scene.cameras.main.resetFX();
  } catch (e) {}
}

/**
 * Transiciones de cámara entre escenas / pantallas completas.
 * @param {Phaser.Scene} scene
 * @param {number} [duration]
 */
export function fadeIn(scene, duration) {
  if (!scene || !scene.cameras || !scene.cameras.main) return;
  if (scene.sys && !scene.sys.isActive()) return;
  var d = duration != null ? duration : 300;
  var cam = scene.cameras.main;
  var evIn = fadeInCompleteEvent();
  function clearFadeStuck() {
    try {
      if (cam && cam.resetFX) cam.resetFX();
    } catch (eC) {}
  }
  try {
    prepareSceneCamera(scene);
    cam.once(evIn, clearFadeStuck);
    cam.fadeIn(d, 0, 0, 0);
    /**
     * Phaser puede dejar el fade “colgado” (overlay negro) si effectComplete no limpia del todo
     * (issue histórico #3833). Reparamos al terminar la entrada y con margen por si el evento no llega.
     */
    if (scene.time) {
      scene.time.delayedCall(d + 120, function () {
        if (!scene.sys || !scene.sys.isActive()) return;
        clearFadeStuck();
      });
    }
  } catch (e) {
    try {
      clearFadeStuck();
    } catch (e2) {}
  }
}

/**
 * @param {Phaser.Scene} scene
 * @param {function} callback
 * @param {number} [duration]
 */
function fadeOutCompleteEvent() {
  if (typeof Phaser !== 'undefined' && Phaser.Cameras && Phaser.Cameras.Events && Phaser.Cameras.Events.FADE_OUT_COMPLETE) {
    return Phaser.Cameras.Events.FADE_OUT_COMPLETE;
  }
  return 'camerafadeoutcomplete';
}

function fadeInCompleteEvent() {
  if (typeof Phaser !== 'undefined' && Phaser.Cameras) {
    var E = Phaser.Cameras.Scene2D && Phaser.Cameras.Scene2D.Events;
    if (E && E.FADE_IN_COMPLETE) return E.FADE_IN_COMPLETE;
    E = Phaser.Cameras.Events;
    if (E && E.FADE_IN_COMPLETE) return E.FADE_IN_COMPLETE;
  }
  return 'camerafadeincomplete';
}

export function fadeOut(scene, callback, duration) {
  var cb = typeof callback === 'function' ? callback : function () {};
  if (!scene || !scene.cameras || !scene.cameras.main) {
    try {
      cb();
    } catch (e0) {}
    return;
  }
  var d = duration != null ? duration : 300;
  var cam = scene.cameras.main;
  var ev = fadeOutCompleteEvent();
  var done = false;
  var fallbackTimer = null;
  function tearDown() {
    try {
      cam.off(ev, onFadeDone);
    } catch (eOff) {}
    if (fallbackTimer && scene.time) {
      try {
        fallbackTimer.remove(false);
      } catch (eRm) {}
      fallbackTimer = null;
    }
  }
  function runOnce() {
    if (done) return;
    done = true;
    tearDown();
    try {
      cb();
    } catch (eCb) {}
  }
  function onFadeDone() {
    runOnce();
  }
  try {
    cam.once(ev, onFadeDone);
    cam.fadeOut(d, 0, 0, 0);
    if (scene.time) {
      fallbackTimer = scene.time.delayedCall(d + 320, runOnce);
    }
  } catch (e) {
    runOnce();
  }
  scene.events.once('shutdown', function () {
    if (done) return;
    tearDown();
  });
}

/**
 * Desliza un objeto de pantalla completa hacia su posición actual.
 * @param {Phaser.Scene} scene
 * @param {string} [direction] 'left' | 'right' | 'up' | 'down'
 * @param {Phaser.GameObjects.GameObject} [target] Si se omite, usa scene._transitionSlideTarget
 */
export function slideIn(scene, direction, target) {
  var dir = direction != null ? direction : 'left';
  var obj = target != null ? target : scene._transitionSlideTarget;
  if (!obj || !scene || !scene.tweens) return;
  if (!scene.cameras || !scene.cameras.main) return;
  if (!scene.sys || !scene.sys.isActive()) return;
  if (!obj.active || obj.scene !== scene) return;
  scene.tweens.killTweensOf(obj);
  var w = scene.cameras.main.width;
  var h = scene.cameras.main.height;
  var ox = obj.x;
  var oy = obj.y;
  var offX = dir === 'left' ? -w * 0.5 : dir === 'right' ? w * 0.5 : 0;
  var offY = dir === 'up' ? -h * 0.35 : dir === 'down' ? h * 0.35 : 0;
  obj.setPosition(ox + offX, oy + offY);
  obj.setAlpha(0.35);
  scene.tweens.add({
    targets: obj,
    x: ox,
    y: oy,
    alpha: 1,
    duration: 420,
    ease: 'Cubic.easeOut'
  });
}
