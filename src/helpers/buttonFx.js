import * as Anim from '../systems/AnimationSystem.js';
import * as Logic from '../logic.js';

/**
 * Pulso periódico + pop y sonido al pulsar (si el archivo existe).
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} gameObject
 * @param {function} onAction ejecutado en pointerup (después del pop)
 * @param {{ disableIdlePulse?: boolean, disablePressPop?: boolean, clickSound?: 'start'|'menu'|'default' }} [opts]
 *   disableIdlePulse — no anima escala en reposo (menús “serios”).
 *   disablePressPop — no usar Anim.animPop al pulsar (Text con backgroundColor rompe la escala → bloque gigante).
 *   clickSound — 'start' = Jingle_de_inicio.mp3 (solo botones que arrancan la aventura/capítulo);
 *                'menu'  = presionar.mp3 (submenús, volver, saltar audio, etc.);
 *                otro u omitido = correct.wav.
 */
function playButtonClickSound(scene, opts) {
  var mode = opts && opts.clickSound;
  if (scene && scene.sound && !scene.sound.mute && scene.cache && scene.cache.audio) {
    if (mode === 'start' && scene.cache.audio.exists('jingleInicio')) {
      try {
        scene.sound.play('jingleInicio', { volume: 0.72 });
        return;
      } catch (eJ) {}
    }
    if (mode === 'menu' && scene.cache.audio.exists('presionar')) {
      try {
        scene.sound.play('presionar', { volume: 0.8 });
        return;
      } catch (eP) {}
    }
  }
  if (Logic.isAudioUsable(Logic.audioCorrect)) {
    Logic.playAudioSafe(Logic.audioCorrect);
  }
}

export function bindAnimatedButton(scene, gameObject, onAction, opts) {
  if (!gameObject || !scene) return;
  if (gameObject.getData && gameObject.getData('_btnFxBound')) return;
  if (gameObject.setData) gameObject.setData('_btnFxBound', true);
  if (!opts || !opts.disableIdlePulse) {
    Anim.animPulseEvery(scene, gameObject, 2000, 3000);
  }
  gameObject.on('pointerdown', function () {
    if (!opts || !opts.disablePressPop) {
      Anim.animPop(scene, gameObject);
    } else {
      try {
        gameObject.setAlpha(0.88);
        if (scene.time) {
          scene.time.delayedCall(90, function () {
            if (gameObject && gameObject.active) gameObject.setAlpha(1);
          });
        }
      } catch (eA) {}
    }
    playButtonClickSound(scene, opts);
  });
  gameObject.on('pointerup', function () {
    if (typeof onAction === 'function') onAction();
  });
}
