/**
 * HUD y mensajes para escenas Phaser.
 */
import * as Anim from './systems/AnimationSystem.js';

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 */
export function mostrarCoordenadas(scene, x, y) {
  var mov = scene.__movRestantes;
  var hx = scene.__hudCoordX != null ? scene.__hudCoordX : 18;
  var hy = scene.__hudCoordY != null ? scene.__hudCoordY : 20;
  var centered = scene.__hudCoordAlign === 'center';
  var topOrigin = scene.__hudCoordTopOrigin === true;
  var wrapW = scene.__hudCoordWrapW != null ? scene.__hudCoordWrapW : 0;

  var ox = centered ? 0.5 : 0;
  var oy = topOrigin ? 0 : centered ? 1 : 0.5;

  var body = 'Posición: (' + x + ', ' + y + ')';
  if (mov !== undefined && mov !== null) {
    if (mov === Infinity) {
      body += '\nSin límite de pasos';
    } else {
      /* Etiqueta corta: evita que el wordWrap parta el número en otra línea (mapa con x negativa). */
      body += '\nPasos: ' + mov;
    }
  }

  if (!scene.__coordHudText || !scene.__coordHudText.active) {
    scene.__coordHudText = null;
    var style = {
      fontFamily: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: scene.__hudCoordFontPx != null ? scene.__hudCoordFontPx + 'px' : '12px',
      color: '#0f0f0f',
      fontStyle: 'bold',
      stroke: '#f8fafc',
      strokeThickness: scene.__hudCoordStroke != null ? scene.__hudCoordStroke : 2,
      backgroundColor: 'rgba(0,0,0,0)',
      padding: { x: 0, y: 0 },
      align: centered ? 'center' : 'left',
      lineSpacing: 1
    };
    if (wrapW > 0) {
      style.wordWrap = { width: wrapW };
    }
    scene.__coordHudText = scene.add
      .text(hx, hy, '', style)
      .setOrigin(ox, oy)
      .setScrollFactor(0)
      .setDepth(1999);
  } else {
    scene.__coordHudText.setPosition(hx, hy);
    scene.__coordHudText.setOrigin(ox, oy);
    if (scene.__hudCoordFontPx != null) {
      scene.__coordHudText.setFontSize(scene.__hudCoordFontPx + 'px');
    }
    if (wrapW > 0) {
      scene.__coordHudText.setStyle({ wordWrap: { width: wrapW } });
    }
  }
  scene.__coordHudText.setText(body);
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} texto
 * @param {{ fontSize?: number, padding?: { x: number, y: number }, holdMs?: number }} [opts]
 */
export function mostrarMensaje(scene, texto, opts) {
  opts = opts || {};
  if (scene.__msgHideTimer) {
    try {
      scene.__msgHideTimer.remove(false);
    } catch (eT) {}
    scene.__msgHideTimer = null;
  }
  if (scene.__msgText) {
    scene.tweens.killTweensOf(scene.__msgText);
    scene.__msgText.destroy();
    scene.__msgText = null;
  }
  var cam = scene.cameras.main;
  var compact = cam.width < 520 || cam.height < 560;
  var fs = opts.fontSize != null ? opts.fontSize : compact ? 13 : 15;
  var pad = opts.padding || { x: compact ? 10 : 12, y: compact ? 7 : 9 };
  var px = cam.centerX;
  var py = cam.height - 64;
  var wrap = Math.max(200, cam.width - 48);
  var oy = 0.5;
  if (scene.__playArea && scene.__playArea.w > 0) {
    var a = scene.__playArea;
    px = a.x + a.w * 0.5;
    py = a.y + a.h - 12;
    wrap = Math.max(120, a.w - 20);
    oy = 1;
  }
  scene.__msgText = scene.add
    .text(px, py, texto, {
      fontFamily: 'Georgia, "Segoe UI", serif',
      fontSize: fs + 'px',
      color: '#fff7ed',
      fontStyle: 'bold',
      backgroundColor: 'rgba(127,29,29,0.92)',
      padding: pad,
      wordWrap: { width: wrap },
      align: 'center',
      lineSpacing: 2
    })
    .setOrigin(0.5, oy)
    .setScrollFactor(0)
    .setDepth(2001);

  var lineCount = String(texto || '').split('\n').length;
  var holdMs =
    opts.holdMs != null
      ? opts.holdMs
      : Math.min(4800, 2200 + lineCount * 450);

  Anim.animFadeIn(scene, scene.__msgText, 220);
  scene.__msgHideTimer = scene.time.delayedCall(holdMs, function () {
    scene.__msgHideTimer = null;
    if (!scene.__msgText || !scene.sys || !scene.sys.isActive()) return;
    Anim.animFadeOut(scene, scene.__msgText, 320, function () {
      if (scene.__msgText) {
        scene.__msgText.destroy();
        scene.__msgText = null;
      }
    });
  });
}
