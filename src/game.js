/**
 * Phaser: precarga (sin cambiar claves ni rutas), escenas y caza del tesoro por coordenadas.
 */
import { levels } from './levels.js';
import * as MissionFlow from './missionFlowValidator.js';
import * as Logic from './logic.js';
import * as UI from './ui.js';
import * as Anim from './systems/AnimationSystem.js';
import * as Particles from './effects/ParticleSystem.js';
import * as Transition from './systems/TransitionSystem.js';
import * as ButtonFx from './helpers/buttonFx.js';
import * as Medals from './medals.js';
import * as Campaign from './campaign.js';
import * as AlbumCodes from './albumCodes.js';

(function () {
  function filenameToAssetKey(filename) {
    var base = filename.replace(/\.[^/.]+$/, '');
    var norm = base
      .replace(/\u202f/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    var parts = norm.split(' ');
    if (!parts.length) return 'image';
    return parts
      .map(function (p, i) {
        if (!p.length) return '';
        var first = p.charAt(0);
        var rest = p.slice(1);
        if (i === 0) return first.toLowerCase() + rest;
        return first.toUpperCase() + rest;
      })
      .join('');
  }

  /** Claves de textura de mapas ilustrados (orden de prueba). */
  var LEVEL_MAP_TEXTURE_KEYS = {
    1: ['mapaBosqueIlustrado'],
    2: ['mapaMontanasIlustrado'],
    3: ['mapaDesiertoIlustrado'],
    4: ['mapaOceanoIlustrado']
  };

  /**
   * @returns {{ key: string, fallback: boolean } | null}
   */
  /** Restaura obstáculos tras explosiones / reinicios (el array del nivel es compartido). */
  function resetLevelObjetosForPlay(level) {
    if (!level) return;
    if (!level._objetosPlantilla && level.objetos && level.objetos.length) {
      level._objetosPlantilla = level.objetos.map(function (o) {
        return { x: o.x, y: o.y, tipo: o.tipo };
      });
    }
    if (!level._objetosPlantilla || !level._objetosPlantilla.length) return;
    level.objetos = level._objetosPlantilla.map(function (o) {
      return { x: o.x, y: o.y, tipo: o.tipo };
    });
  }

  function resolveLevelMapTexture(scene, level) {
    if (!scene || !level || !scene.textures) return null;
    var tries = [];
    if (level.mapKey) tries.push(level.mapKey);
    if (level.mapa && level.mapa !== level.mapKey) tries.push(level.mapa);
    var byId = LEVEL_MAP_TEXTURE_KEYS[level.id];
    if (byId) {
      for (var b = 0; b < byId.length; b++) tries.push(byId[b]);
    }
    for (var i = 0; i < tries.length; i++) {
      if (tries[i] && scene.textures.exists(tries[i])) {
        return { key: tries[i], fallback: false };
      }
    }
    if (scene.textures.exists('fondosNivelesGouache')) {
      return {
        key: 'fondosNivelesGouache',
        fallback: true,
        gouacheStrip: Math.max(0, Math.min(3, (level.id || 1) - 1))
      };
    }
    console.warn(
      '[Caza Tesoro] Mapa no encontrado para nivel',
      level.id,
      '— probado:',
      tries.join(', '),
      '| Coloca assets/mapas/mapa_montanas_ilustrado.webp (y recarga con Ctrl+Shift+R)'
    );
    return null;
  }

  /**
   * Escala el PNG del mapa. En móvil vertical: "contain" para ver el ancho completo
   * del arte (sin recortar árboles a los lados); en escritorio: cubre la rejilla.
   */
  /** Quita cielo vacío del PNG (fracción superior del frame actual). */
  function applyMapSkyCrop(image, fraction) {
    if (!image || !image.frame || fraction <= 0) return;
    try {
      var cutX = image.frame.cutX;
      var cutY = image.frame.cutY;
      var cutW = image.frame.cutWidth;
      var cutH = image.frame.cutHeight;
      var cropY = Math.floor(cutH * Phaser.Math.Clamp(fraction, 0, 0.35));
      if (cropY < 4) return;
      image.setCrop(cutX, cutY + cropY, cutW, cutH - cropY);
    } catch (eCrop) {}
  }

  function layoutPlayfieldMap(image, opts) {
    var gridW = opts.gridW;
    var gridH = opts.gridH;
    var mapInfo = opts.mapInfo;
    var tallMap = !!(
      (opts.portraitTall || opts.landscapeTallMap) &&
      mapInfo &&
      !mapInfo.fallback
    );
    var viewportW = opts.viewportW != null ? opts.viewportW : gridW;
    var gridOriginY = opts.gridOriginY;
    var gridMidX = opts.gridMidX;

    if (tallMap && opts.dockTopY != null) {
      var mapTopY = opts.mapTopY != null ? opts.mapTopY : 0;
      var mapRegionTop = mapTopY;
      var mapRegionH = Math.max(gridH + 24, opts.dockTopY - mapRegionTop);
      var decorW =
        opts.mapDecorW != null ? opts.mapDecorW : Math.max(gridW + 12, gridW);
      if (opts.mapCropTopFrac > 0) applyMapSkyCrop(image, opts.mapCropTopFrac);
      var fitW = decorW / image.width;
      var fitH = mapRegionH / image.height;
      var coverBoost = opts.mapCoverBoost != null ? opts.mapCoverBoost : 1.08;
      var ms = Math.max(fitW, fitH) * coverBoost;
      var mapCx = gridMidX != null ? gridMidX : (opts.gridOriginX != null ? opts.gridOriginX : 0) + gridW * 0.5;
      var scaledH = image.height * ms;
      var liftPx =
        opts.mapLiftPx != null
          ? opts.mapLiftPx
          : Math.min(Math.floor(scaledH * 0.12), Math.floor(mapRegionH * 0.08), 64);
      var mapCy = mapRegionTop + scaledH * 0.5 - liftPx;
      image.setScale(ms);
      image.setPosition(mapCx, mapCy);
      return {
        tallMap: true,
        mapViewportH: mapRegionH,
        mapTopY: mapTopY,
        scale: ms,
        mapDecorW: decorW,
        mapCx: mapCx,
        mapCy: mapCy
      };
    }

    var bottomGap = opts.bottomReserve != null ? opts.bottomReserve : 10;
    var mapViewportH = tallMap
      ? Math.max(gridH, (opts.viewportH || gridH) - gridOriginY - bottomGap)
      : gridH;
    var mapCx = tallMap ? viewportW * 0.5 : gridMidX;
    var mapCy = tallMap ? gridOriginY + mapViewportH * 0.5 : opts.gridMidY;
    var ms;
    if (tallMap) {
      var fitW2 = (viewportW - 6) / image.width;
      var fitH2 = mapViewportH / image.height;
      ms = Math.min(fitW2, fitH2) * 0.98;
    } else {
      ms = Math.max(gridW / image.width, gridH / image.height) * 1.04;
    }
    image.setScale(ms);
    image.setPosition(mapCx, mapCy);
    return { tallMap: tallMap, mapViewportH: mapViewportH, scale: ms };
  }

  function planDialogDock(w, h) {
    var isPortrait = h > w;
    var isDesktopWide = !isPortrait && w >= 700;
    var dockH = computeDialogDockHeight(w, h);
    var marginBottom = isDesktopWide ? 0 : isPortrait ? 0 : Math.max(6, Math.floor(w * 0.018));
    return {
      dockH: dockH,
      dockTopY: h - dockH - marginBottom,
      marginBottom: marginBottom,
      isPortrait: isPortrait,
      isDesktopWide: isDesktopWide
    };
  }

  /** Recorte horizontal del PNG fondos_niveles_gouache (4 mundos en fila). */
  function applyGouacheMapStrip(image, levelOrStripIndex) {
    if (!image || !image.texture || image.texture.key !== 'fondosNivelesGouache') return;
    try {
      var strip =
        typeof levelOrStripIndex === 'number'
          ? levelOrStripIndex
          : Math.max(0, Math.min(3, ((levelOrStripIndex && levelOrStripIndex.id) || 1) - 1));
      var src = image.texture.getSourceImage();
      var tw = (src && src.width) || 1536;
      var th = (src && src.height) || 1024;
      var stripW = Math.max(1, Math.floor(tw / 4));
      image.setCrop(strip * stripW, 0, stripW, th);
    } catch (eCrop) {}
  }

  /**
   * Profundidades: ejes y ticks ≈ PLAYFIELD_TICK_DEPTH; franja de misión debajo del mapa debe quedar
   * ENCIMA de los ticks para que el texto no quede oculto (Bosque/Montañas). Modales por encima.
   */
  var PLAYFIELD_TICK_DEPTH = 5200;
  var PLAY_DIALOG_DOCK_DEPTH = 5300;
  var PLAY_SOUND_TOGGLE_DEPTH = 5310;
  var TASK_BOTTOM_MODAL_BASE_DEPTH = 5500;

  /** Imágenes precargadas en BootScene (solo las que el juego activo usa). */
  var ASSET_IMAGE_REL_PATHS = [
    'characters/Sir Vectorius.png',
    'pantallas/pantalla_derrota.webp',
    'pantallas/pantalla_inicio_juego.webp',
    'pantallas/pantalla_victoria.webp',
    'stickers/elementos_del_plano/sticker_tesoro_cofre.png',
    'stickers/recompensas/sticker_medallas_puntos.png'
  ];

  /** Rellena el viewport (zonas sin imagen): más contraste para que el relleno se distinga del centro. */
  function paintViewportGradient(gfx, w, h) {
    if (!gfx || !gfx.active) return;
    gfx.clear();
    var sky = 0xd4e8ea;
    var sandHi = 0xf5ebdc;
    var shore = 0xb8ddd6;
    var sandLo = 0xc9a878;
    gfx.fillGradientStyle(sky, sandHi, shore, sandLo, 1, 1, 1, 1);
    gfx.fillRect(0, 0, w, h);
  }

  /**
   * Marco sobre la ilustración: laterales + bandas arriba/abajo (siempre encima del fondo, se redibuja en resize).
   * Sin esto el degradado de fondo queda oculto detrás del PNG a pantalla completa.
   */
  function paintMenuFrameOverlay(gfx, w, h) {
    if (!gfx || !gfx.active) return;
    gfx.clear();
    var fadeW = Math.min(Math.max(w * 0.22, 64), 260);
    var stripH = Math.max(56, Math.min(h * 0.2, 180));
    var aqua = 0x6aa7b3;
    var sand = 0xbea078;
    var topSky = 0x4a8f9e;
    var botSand = 0x966b45;
    gfx.fillGradientStyle(topSky, topSky, topSky, topSky, 0.52, 0.52, 0, 0);
    gfx.fillRect(0, 0, w, stripH);
    gfx.fillGradientStyle(botSand, botSand, botSand, botSand, 0, 0, 0.55, 0.55);
    gfx.fillRect(0, h - stripH, w, stripH);
    gfx.fillGradientStyle(aqua, aqua, sand, sand, 0.78, 0, 0.72, 0);
    gfx.fillRect(0, 0, fadeW, h);
    gfx.fillGradientStyle(aqua, aqua, sand, sand, 0, 0.78, 0, 0.72);
    gfx.fillRect(w - fadeW, 0, fadeW, h);
  }

  function bindViewportGradient(scene, gfx) {
    var apply = function () {
      var cam = scene.cameras && scene.cameras.main;
      if (!cam) return;
      paintViewportGradient(gfx, cam.width, cam.height);
    };
    apply();
    if (scene.scale && typeof scene.scale.on === 'function') {
      scene.scale.on('resize', apply);
      scene.events.once('shutdown', function () {
        if (scene.scale && typeof scene.scale.off === 'function') scene.scale.off('resize', apply);
      });
    }
  }

  /**
   * Ilustraciones a pantalla (menú, victoria, derrota…): sin deformar.
   * - Arte vertical o móvil: ocupa todo el alto del viewport.
   * - Arte apaisado en PC/monitor: modo cover (sin bandas arriba/abajo).
   * opts.mode: 'height' | 'contain' | 'cover'
   */
  function layoutMainMenuBgImage(scene, img, opts) {
    opts = opts || {};
    if (!img || !img.active || !img.frame) return 1;
    var w = scene.cameras.main.width;
    var h = scene.cameras.main.height;
    var baseW = img.frame.width;
    var baseH = img.frame.height;
    if (baseW < 1 || baseH < 1) return 1;
    var fitW = w / baseW;
    var fitH = h / baseH;
    var isLandscape = w >= h;
    var scale;
    if (opts.mode === 'contain') {
      scale = Math.min(fitW, fitH);
    } else if (opts.mode === 'cover' || opts.mode === 'height') {
      scale = opts.mode === 'cover' ? Math.max(fitW, fitH) : fitH;
    } else if (isLandscape && baseW >= baseH * 1.05) {
      scale = Math.max(fitW, fitH);
    } else {
      scale = fitH;
    }
    img.setScale(scale);
    img.setPosition(w * 0.5, h * 0.5);
    return scale;
  }

  function bindFullscreenIllustrationResize(scene, img, layoutFn) {
    if (!scene || !img || typeof layoutFn !== 'function') return;
    if (!scene.scale || typeof scene.scale.on !== 'function') return;
    var handler = function () {
      if (!img.active || !scene.sys || !scene.sys.isActive()) return;
      layoutFn();
    };
    scene.scale.on('resize', handler);
    scene.events.once('shutdown', function () {
      if (scene.scale && typeof scene.scale.off === 'function') scene.scale.off('resize', handler);
    });
  }

  /** Preferencia: ayuda plegada tras cerrar el diálogo (localStorage). */
  var LS_AYUDA_CERRADA = 'ctc_cartesiano_ayuda_cerrada';
  /** Prólogo de la tira (Malasia / Penny / Sabiondo) ya visto al menos una vez. */
  var LS_COMIC_INTRO = 'ctc_comic_intro_played';

  function hasComicIntroPlayed() {
    try {
      return localStorage.getItem(LS_COMIC_INTRO) === '1';
    } catch (e) {
      return false;
    }
  }

  function markComicIntroPlayed() {
    try {
      localStorage.setItem(LS_COMIC_INTRO, '1');
    } catch (e) {}
  }

  function clearComicIntroPlayed() {
    try {
      localStorage.removeItem(LS_COMIC_INTRO);
    } catch (e) {}
  }

  function duckBgMusicVolume(scene, volume) {
    var reg = scene.game && scene.game.registry;
    if (!reg) return;
    var music = reg.get('bgMusic');
    if (music && typeof music.volume === 'number') {
      try {
        music.volume = volume;
      } catch (eD) {}
    }
  }

  function restoreBgMusicVolume(scene) {
    var sm = getSoundManager(scene);
    duckBgMusicVolume(scene, sm && sm.mute ? 0 : 0.4);
  }

  /** Desde el menú: prólogo (solo 1ª vez, nivel 1) o pantalla de misión. */
  function startMissionFromMenu(scene, levelIndex) {
    var idx = Phaser.Math.Clamp(levelIndex != null ? levelIndex : 0, 0, levels.length - 1);
    var target = idx === 0 && !hasComicIntroPlayed() ? 'IntroPrologueScene' : 'PreLevelScene';
    /* Evita fadeOut del menú → pantalla negra tras derrota / reentrada. */
    navigateFromEndScreen(scene, target, { levelIndex: idx });
  }

  /**
   * penny.png / explorer: ideal 320×320 → 4×4 → celda 80×80 (16 frames).
   * Tras alinear poses “a ojo” en el editor, el PNG debe seguir siendo múltiplo exacto de la celda
   * (p. ej. 320÷80); si cambias tamaño total, ajusta EXPLORER_FRAME_W/H. Comprueba en partida con F2 (debe salir OK).
   * Cada fila: cols 0–3 = idle → paso → paso → idle (0 y 3 suelen ser el mismo neutro).
   * Caminata: animación Phaser walk_* con duration = ms por casilla (como el explorer original).
   *
   * Filas del PNG (0-based): 0 frente (↓), 1 espalda (↑), 2 izquierda (←), 3 derecha (→).
   *
   * EXPLORER_FLIP_LEFT: si tu hoja no tiene fila de "izquierda" propia y reutilizas
   * la fila de "derecha" volteada en horizontal, pon true. Por defecto false
   * (se asume que cada dirección tiene su fila).
   *
   * Nota: las constantes y la clave de textura siguen llamándose "explorer" por
   * compatibilidad histórica; el sprite real es Penny (penny.png).
   */
  var EXPLORER_FRAME_W = 80;
  var EXPLORER_FRAME_H = 80;
  /** Columnas por fila (320/80 = 4). */
  var EXPLORER_SHEET_COLS = 4;
  /** Columna del reposo (primera celda de la fila). */
  var EXPLORER_IDLE_COL = 0;
  /** Solo para overlay F2: columnas del ciclo (0–3 = igual que animación Lumi). */
  var EXPLORER_WALK_COLUMN = [0, 1, 2, 3];
  var EXPLORER_ROW = {
    down: 0,
    up: 1,
    left: 2,
    right: 3
  };
  var EXPLORER_FLIP_LEFT = false;
  /** Ms por casilla = duración de un ciclo walk (4 frames). Más alto = caminar más lento. */
  var EXPLORER_MOVE_MS_PER_CELL = 360;
  /**
   * Origen del sprite (0–1): Y alto ancla hacia los pies del frame 80×80 → menos salto al pasar de idle a paso
   * (antes el centro geométrico quedaba en el centro de celda y el dibujo “bajaba” respecto al eje).
   */
  var EXPLORER_ORIGIN_X = 0.5;
  /** Ancla los pies del frame en el vértice de la rejilla (eje x / intersección). */
  var EXPLORER_ORIGIN_Y = 0.94;
  /** Altura en pantalla ≈ cellSize × factor (Penny usa 1.52 en partida). */
  var PENNY_DISPLAY_BOX = 1.52;
  /** Sir Vectorius: un poco más alto que Penny (PNG redimensionado por el autor). */
  var SIR_VECTORIUS_DISPLAY_BOX = 1.68;
  /** Ajuste fino en la casilla (1, 2) sobre el mapa ilustrado (fracción de cellSize). */
  var SIR_VECTORIUS_NUDGE_X = -0.14;
  var SIR_VECTORIUS_NUDGE_Y = 0.08;
  /** Sombrero de Gadget en (−3, 4) sobre el mapa ilustrado. */
  var SOMBRERO_DISPLAY_BOX = 1.02;
  var SOMBRERO_NUDGE_X = -0.06;
  var SOMBRERO_NUDGE_Y = 0.04;
  /** Secuaz de M.A.D. (compinche): un poco más bajo que Vectorius. */
  var SECUAZ_MAD_DISPLAY_BOX = 1.62;
  /** Sabiondo rastreando huellas (sultan2.png). */
  var SULTAN_RASTREO_DISPLAY_BOX = 1.62;
  var SULTAN_RASTREO_NUDGE_X = 0.08;
  var SULTAN_RASTREO_NUDGE_Y = 0.05;
  /** Interlineado único en avisos/preguntas de partida (medición = dibujo). */
  var PLAY_DIALOG_LINE_SPACING = 2;
  /** Ajuste fino en píxeles (fracción de celda); 0 = pies sobre la línea del eje. */
  var EXPLORER_FEET_NUDGE_Y_MULT = 0;

  /** Lobo guardián: tira 1×4 (lobo.png). Si redimensionas el PNG, mide ancho/alto y pon
   * frameWidth = floor(ancho/4), frameHeight = alto.
   * LOBO_PLAY_IDLE: solo true si en TODOS los frames el cuerpo está en el mismo sitio
   * (misma caja); si no, al animar parece que el lobo “camina en el sitio”. */
  var LOBO_FRAME_W = 113;
  var LOBO_FRAME_H = 120;
  var LOBO_PLAY_IDLE = true;

  /** Fila del spritesheet (0..3) según dirección en español. */
  function explorerRowForDir(dir) {
    return dir === 'arriba'
      ? EXPLORER_ROW.up
      : dir === 'abajo'
        ? EXPLORER_ROW.down
        : dir === 'izquierda'
          ? EXPLORER_ROW.left
          : EXPLORER_ROW.right;
  }

  /** Alinea el sprite a píxeles enteros al terminar el paso (sin pelear con el tween). */
  function explorerSnapCharacterPixels(scene) {
    if (!scene._useExplorerSprite || !scene.character) return;
    var spr = scene.character;
    var x = spr.x;
    var y = spr.y;
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return;
    spr.setPosition(Math.round(x), Math.round(y));
  }

  /** Recrea walk_* para que duration coincida con EXPLORER_MOVE_MS_PER_CELL (un ciclo = una casilla). */
  function ensureExplorerWalkAnims(scene) {
    if (!scene || !scene.anims) return;
    ['walk_down', 'walk_up', 'walk_left', 'walk_right'].forEach(function (key) {
      try {
        if (scene.anims.exists(key)) scene.anims.remove(key);
      } catch (eR) {}
    });
    var last = EXPLORER_SHEET_COLS - 1;
    ['down', 'up', 'left', 'right'].forEach(function (d) {
      var row = EXPLORER_ROW[d];
      try {
        scene.anims.create({
          key: 'walk_' + d,
          frames: scene.anims.generateFrameNumbers('explorer', {
            start: row * EXPLORER_SHEET_COLS,
            end: row * EXPLORER_SHEET_COLS + last
          }),
          duration: EXPLORER_MOVE_MS_PER_CELL,
          repeat: -1
        });
      } catch (eW) {
        console.warn('[Caza Tesoro] walk_' + d + ' no creada:', eW);
      }
    });
  }

  function playExplorerWalk(scene, dir) {
    if (!scene._useExplorerSprite || !scene.character || typeof scene.character.play !== 'function') return;
    var key =
      dir === 'arriba'
        ? 'walk_up'
        : dir === 'abajo'
          ? 'walk_down'
          : dir === 'izquierda'
            ? 'walk_left'
            : 'walk_right';
    if (scene.character.setFlipX) {
      scene.character.setFlipX(EXPLORER_FLIP_LEFT && dir === 'izquierda');
    }
    scene.character.play(key, false);
  }

  function prepareExplorerWalkForMove(scene, dir) {
    if (!scene._useExplorerSprite || !scene.character) return;
    if (scene.character.anims) scene.character.anims.stop();
    playExplorerWalk(scene, dir);
  }

  function setExplorerIdleForDirection(scene, dir) {
    if (!scene._useExplorerSprite || !scene.character) return;
    if (scene.character.anims) scene.character.anims.stop();
    var row = explorerRowForDir(dir);
    if (scene.character.setFlipX) {
      scene.character.setFlipX(EXPLORER_FLIP_LEFT && dir === 'izquierda');
    }
    scene.character.setFrame(row * EXPLORER_SHEET_COLS + EXPLORER_IDLE_COL);
    explorerSnapCharacterPixels(scene);
  }

  /* ============================================================
   * Música de fondo (gadget) en bucle, compartida entre escenas.
   * ------------------------------------------------------------
   * Phaser comparte el SoundManager entre escenas del mismo Game,
   * así que basta con crear UNA instancia y mantenerla viva.
   * Si el navegador bloquea el audio antes del primer gesto del
   * usuario, dejamos un listener para reanudar al primer click/touch.
   * ============================================================ */
  /** Detiene la música de fondo con un fundido suave.
   *  Se llama al terminar la pantalla (victoria/derrota). La siguiente escena
   *  la reanuda automáticamente vía `ensureBgMusic`. */
  function stopBgMusic(scene, fadeMs, onComplete) {
    var done = typeof onComplete === 'function' ? onComplete : null;
    function finish() {
      if (done) done();
    }
    if (!scene || !scene.sound) {
      finish();
      return;
    }
    var reg = scene.game && scene.game.registry;
    if (!reg) {
      finish();
      return;
    }
    var music = reg.get('bgMusic');
    if (!music) {
      finish();
      return;
    }
    var dur = fadeMs != null ? fadeMs : 500;
    try {
      if (scene.tweens && music.isPlaying) {
        scene.tweens.add({
          targets: music,
          volume: 0,
          duration: dur,
          onComplete: function () {
            try { music.stop(); } catch (eS) {}
            try { music.volume = 0.4; } catch (eV) {}
            finish();
          }
        });
      } else {
        music.stop();
        music.volume = 0.4;
        finish();
      }
    } catch (e) {
      finish();
    }
  }

  /** Corta pasos, lobo, wrong, etc. antes del stinger de game over. */
  function stopAllGameplaySounds(scene) {
    if (!scene || !scene.sound) return;
    try {
      scene.sound.stopAll();
    } catch (eA) {}
    var reg = scene.game && scene.game.registry;
    if (!reg) return;
    var music = reg.get('bgMusic');
    if (!music) return;
    try {
      music.stop();
      music.volume = 0.4;
    } catch (eM) {}
  }

  /** Estado único de silencio (registry + Phaser); evita desfase icono ↔ audio. */
  function isGameSoundMuted(scene) {
    var g = scene && scene.game;
    if (g && g.registry && g.registry.has('ctcSoundMuted')) {
      return !!g.registry.get('ctcSoundMuted');
    }
    var sm = getSoundManager(scene);
    return sm ? !!sm.mute : false;
  }

  function syncPhaserMuteFlag(scene) {
    var sm = getSoundManager(scene);
    if (!sm) return;
    sm.mute = isGameSoundMuted(scene);
  }

  /** La música es Phaser.Sound pero conviene forzar volumen 0 si está silenciado. */
  function syncBgMusicVolumeToMute(scene) {
    var reg = scene.game && scene.game.registry;
    if (!reg) return;
    var music = reg.get('bgMusic');
    if (!music) return;
    try {
      if (typeof music.volume === 'number') {
        music.volume = isGameSoundMuted(scene) ? 0 : 0.4;
      }
    } catch (eV) {}
  }

  function resumeWebAudioContext(scene) {
    var sm = getSoundManager(scene);
    if (!sm || !sm.context) return;
    try {
      if (sm.context.state === 'suspended') {
        var resumed = sm.context.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(function () {});
      }
    } catch (eCtx) {}
  }

  /** Reanuda o recrea la música de fondo tras desmutear. */
  function restoreBgMusicAfterUnmute(scene) {
    if (isGameSoundMuted(scene)) return;
    var sm = getSoundManager(scene);
    if (!sm) return;
    sm.mute = false;
    resumeWebAudioContext(scene);

    var reg = scene.game && scene.game.registry;
    if (!reg) return;

    var music = reg.get('bgMusic');
    var broken = !music;
    if (music) {
      try {
        broken = music.pendingRemove === true;
      } catch (eBr) {
        broken = true;
      }
    }

    if (broken) {
      try {
        if (music) music.destroy();
      } catch (eD) {}
      reg.remove('bgMusic');
      ensureBgMusic(scene);
      syncBgMusicVolumeToMute(scene);
      return;
    }

    try {
      if (typeof music.volume === 'number') music.volume = 0.4;
      if (!music.isPlaying) music.play();
    } catch (eP) {
      try {
        music.destroy();
      } catch (eD2) {}
      reg.remove('bgMusic');
      ensureBgMusic(scene);
    }
    syncBgMusicVolumeToMute(scene);
  }

  function setGameSoundMuted(scene, muted) {
    var g = scene && scene.game;
    if (!g || !g.registry) return;
    g.registry.set('ctcSoundMuted', !!muted);
    syncPhaserMuteFlag(scene);

    if (muted) {
      var music = g.registry.get('bgMusic');
      try {
        if (music && typeof music.volume === 'number') music.volume = 0;
      } catch (eM0) {}
    } else {
      restoreBgMusicAfterUnmute(scene);
    }
    syncAllSoundToggleChrome(scene);
  }

  function toggleGameSoundMuted(scene) {
    setGameSoundMuted(scene, !isGameSoundMuted(scene));
  }

  function trackSoundToggleRoot(scene, root) {
    var g = scene.game;
    if (!g || !g.registry || !root) return;
    var list = g.registry.get('ctcSoundToggleRoots');
    if (!list) list = [];
    if (list.indexOf(root) < 0) list.push(root);
    g.registry.set('ctcSoundToggleRoots', list);
    scene.events.once('shutdown', function () {
      var lst = g.registry.get('ctcSoundToggleRoots') || [];
      g.registry.set(
        'ctcSoundToggleRoots',
        lst.filter(function (r) {
          return r !== root;
        })
      );
    });
  }

  function syncAllSoundToggleChrome(scene) {
    var g = scene && scene.game;
    if (!g || !g.registry) return;
    var list = g.registry.get('ctcSoundToggleRoots') || [];
    var kept = [];
    for (var i = 0; i < list.length; i++) {
      var root = list[i];
      if (root && root.active) {
        paintSoundToggleChrome(root, scene);
        kept.push(root);
      }
    }
    g.registry.set('ctcSoundToggleRoots', kept);
  }

  function ensureBgMusic(scene) {
    if (!getSoundManager(scene)) return;
    var reg = scene.game && scene.game.registry;
    if (!reg) return;
    if (!scene.cache || !scene.cache.audio || !scene.cache.audio.exists('gadgetPenny')) return;

    syncPhaserMuteFlag(scene);

    var existing = reg.get('bgMusic');
    if (existing) {
      if (existing.isPlaying) {
        syncBgMusicVolumeToMute(scene);
        return;
      }
      if (!isGameSoundMuted(scene)) {
        try {
          existing.play();
          syncBgMusicVolumeToMute(scene);
          return;
        } catch (e) {}
      } else {
        syncBgMusicVolumeToMute(scene);
        return;
      }
    }

    var music;
    try {
      music = scene.sound.add('gadgetPenny', {
        loop: true,
        volume: isGameSoundMuted(scene) ? 0 : 0.4
      });
      if (!isGameSoundMuted(scene)) music.play();
      syncBgMusicVolumeToMute(scene);
    } catch (eAdd) {
      return;
    }
    reg.set('bgMusic', music);

    /* Si el contexto está suspendido (autoplay bloqueado), reanudamos al primer gesto. */
    var unlock = function () {
      try {
        if (scene.sound && scene.sound.context && scene.sound.context.state === 'suspended') {
          scene.sound.context.resume();
        }
        if (music && !music.isPlaying) music.play();
        syncBgMusicVolumeToMute(scene);
      } catch (eU) {}
    };
    if (scene.input) {
      scene.input.once('pointerdown', unlock);
      if (scene.input.keyboard && typeof scene.input.keyboard.once === 'function') {
        scene.input.keyboard.once('keydown', unlock);
      }
    }
  }

  function getSoundManager(scene) {
    if (!scene) return null;
    if (scene.sound) return scene.sound;
    if (scene.game && scene.game.sound) return scene.game.sound;
    return null;
  }

  /** Tamaño compacto del botón de sonido (círculo, táctil mínimo ~40px). */
  function resolveSoundToggleSize(scene, opts) {
    opts = opts || {};
    if (opts.targetPx != null) return Phaser.Math.Clamp(Math.round(opts.targetPx), 34, 48);
    var vw = scene.cameras.main.width;
    var vh = scene.cameras.main.height;
    var compact = vw < 520 || vh < 620;
    if (opts.size === 'menu') {
      return Math.round(Phaser.Math.Clamp(vw * 0.09, compact ? 38 : 40, compact ? 42 : 44));
    }
    return Math.round(Phaser.Math.Clamp(vw * 0.082, compact ? 34 : 36, compact ? 36 : 38));
  }

  /** Botón circular compacto ON/OFF (solo icono, sin pixelado). */
  function paintSoundToggleChrome(root, scene) {
    if (!root) return;
    var muted = isGameSoundMuted(scene);
    var btnSize = root.getData('btnSize') || 40;
    var half = btnSize / 2;
    var r = half - 1;

    var shadow = root.getData('shadowGfx');
    var bg = root.getData('bgGfx');
    var icon = root.getData('iconGfx');
    if (!bg || !icon) return;

    if (shadow) {
      shadow.clear();
      shadow.fillStyle(0x000000, 0.22);
      shadow.fillCircle(1, 2, r);
    }

    bg.clear();
    if (muted) {
      bg.fillStyle(0x64748b, 1);
      bg.fillCircle(0, 0, r);
      bg.lineStyle(1.5, 0xcbd5e1, 0.9);
      bg.strokeCircle(0, 0, r);
    } else {
      bg.fillGradientStyle(0xfde68a, 0xfde68a, 0xd97706, 0xd97706, 1, 1, 1, 1);
      bg.fillCircle(0, 0, r);
      bg.fillStyle(0xffffff, 0.2);
      bg.fillEllipse(0, -r * 0.22, r * 1.15, r * 0.55);
      bg.lineStyle(1.5, 0x92400e, 0.88);
      bg.strokeCircle(0, 0, r);
    }

    icon.clear();
    var bodyW = btnSize * 0.17;
    var bodyH = btnSize * 0.26;
    var coneX = -btnSize * 0.16;
    var iconFill = muted ? 0xf1f5f9 : 0xfffef8;
    icon.fillStyle(iconFill, 1);
    icon.fillRoundedRect(coneX, -bodyH / 2, bodyW, bodyH, 2);
    icon.fillTriangle(coneX + bodyW, -bodyH * 0.58, coneX + bodyW, bodyH * 0.58, -btnSize * 0.015, 0);

    var strokeW = Math.max(1.25, btnSize * 0.04);
    if (!muted) {
      icon.lineStyle(strokeW, 0xfffef8, 0.92);
      for (var wi = 0; wi < 2; wi++) {
        var arcR = btnSize * (0.14 + wi * 0.1);
        icon.beginPath();
        icon.arc(btnSize * 0.06, 0, arcR, -0.62, 0.62, false);
        icon.strokePath();
      }
    } else {
      icon.lineStyle(strokeW + 0.5, 0xef4444, 0.95);
      icon.lineBetween(-r * 0.55, r * 0.55, r * 0.55, -r * 0.55);
    }
  }

  function syncSoundTogglePair(root, scene) {
    paintSoundToggleChrome(root, scene);
  }

  function refreshSoundToggleHitZone(root, scene) {
    if (!root || !root.active) return;
    var hitZone = root.getData('hitZone');
    if (!hitZone || !hitZone.active) return;
    var btnSize = root.getData('btnSize') || 40;
    var pad = 14;
    hitZone.setSize(Math.max(btnSize + pad, 44), Math.max(btnSize + pad, 44));
    hitZone.setOrigin(0.5, 0.5);
    hitZone.setInteractive({ useHandCursor: true });
  }

  function bindSoundTogglePointer(hitZone, root, scene) {
    if (!hitZone) return;
    hitZone.removeAllListeners();
    hitZone.on('pointerup', function (pointer, localX, localY, event) {
      if (event && event.stopPropagation) event.stopPropagation();
      if (root.getData('sndClickLock')) return;
      root.setData('sndClickLock', true);
      scene.time.delayedCall(260, function () {
        if (root && root.active) root.setData('sndClickLock', false);
      });
      try {
        root.setAlpha(0.82);
        scene.time.delayedCall(90, function () {
          if (root && root.active) root.setAlpha(1);
        });
      } catch (eA) {}
      toggleGameSoundMuted(scene);
    });
  }

  /**
   * Botón vectorial ON/OFF (Phaser sound.mute). opts: place, margin, x, y, targetPx, depth, pulse.
   */
  function layoutSoundToggleRoot(root, scene, opts) {
    opts = opts || {};
    var cam = scene.cameras.main;
    var vw = cam.width;
    var targetPx = resolveSoundToggleSize(scene, opts);
    root.setData('btnSize', targetPx);
    root.setScale(1);
    paintSoundToggleChrome(root, scene);
    if (opts.place === 'top-right') {
      var m = opts.margin != null ? opts.margin : 18;
      root.setPosition(vw - m - root.displayWidth / 2, m + root.displayHeight / 2);
    } else if (opts.place === 'top-left') {
      var mL = opts.margin != null ? opts.margin : 18;
      root.setPosition(mL + root.displayWidth / 2, mL + root.displayHeight / 2);
    } else if (opts.x != null && opts.y != null) {
      root.setPosition(opts.x, opts.y);
    }
    refreshSoundToggleHitZone(root, scene);
    bindSoundTogglePointer(root.getData('hitZone'), root, scene);
  }

  function mountSoundToggle(scene, opts) {
    opts = opts || {};
    var btnSize = resolveSoundToggleSize(scene, opts);

    var root = scene.add.container(0, 0);
    var shadowGfx = scene.add.graphics();
    var bgGfx = scene.add.graphics();
    var iconGfx = scene.add.graphics();

    root.add(shadowGfx);
    root.add(bgGfx);
    root.add(iconGfx);

    var hitZone = scene.add.zone(0, 0, Math.max(btnSize + 14, 44), Math.max(btnSize + 14, 44));
    hitZone.setOrigin(0.5, 0.5);
    root.add(hitZone);

    root.setData('shadowGfx', shadowGfx);
    root.setData('bgGfx', bgGfx);
    root.setData('iconGfx', iconGfx);
    root.setData('hitZone', hitZone);
    root.setData('btnSize', btnSize);

    if (opts.skipAutoPosition) {
      paintSoundToggleChrome(root, scene);
      refreshSoundToggleHitZone(root, scene);
      bindSoundTogglePointer(hitZone, root, scene);
    } else {
      layoutSoundToggleRoot(root, scene, opts);
    }

    trackSoundToggleRoot(scene, root);
    paintSoundToggleChrome(root, scene);

    root.setScrollFactor(0);
    root.setDepth(opts.depth != null ? opts.depth : 5000);

    if (opts.pulse !== false) {
      Anim.animPulseEvery(scene, root, 2400, 3400);
    }

    var reflow = function () {
      layoutSoundToggleRoot(root, scene, opts);
    };
    if (opts.place === 'top-right' && scene.scale && typeof scene.scale.on === 'function') {
      scene.scale.on('resize', reflow);
      scene.events.once('shutdown', function () {
        if (scene.scale && typeof scene.scale.off === 'function') scene.scale.off('resize', reflow);
      });
    }

    return root;
  }

  function BootScene() {
    Phaser.Scene.call(this, { key: 'BootScene' });
  }
  BootScene.prototype = Object.create(Phaser.Scene.prototype);
  BootScene.prototype.constructor = BootScene;
  BootScene.prototype.preload = function () {
    var self = this;
    this.load.on('loaderror', function (file) {
      console.warn('[Caza Tesoro] loaderror:', file && file.key, file && file.url);
    });
    ASSET_IMAGE_REL_PATHS.forEach(function (rel) {
      var parts = rel.split('/');
      var base = parts[parts.length - 1];
      var key = filenameToAssetKey(base);
      self.load.image(key, 'assets/' + rel);
    });
    /* Mapas ilustrados (WebP). Claves fijas = level.mapKey. */
    [
      ['mapaBosqueIlustrado', 'assets/mapas/mapa_bosque_ilustrado.webp'],
      ['mapaMontanasIlustrado', 'assets/mapas/mapa_montanas_ilustrado.webp'],
      ['mapaDesiertoIlustrado', 'assets/mapas/mapa_desierto_ilustrado.webp'],
      ['mapaOceanoIlustrado', 'assets/mapas/mapa_oceano_ilustrado.webp']
    ].forEach(function (pair) {
      self.load.image(pair[0], pair[1]);
    });
    self.load.spritesheet('explorer', 'assets/sprites/penny.png', {
      frameWidth: EXPLORER_FRAME_W,
      frameHeight: EXPLORER_FRAME_H
    });
    /* Misma URL otra clave: Image('explorer') sin frame usa solo el frame 0 del spritesheet;
       F2 necesita ver el PNG entero alineado con la rejilla. */
    self.load.image('explorerFull', 'assets/sprites/penny.png');
    /* Lobo guardián: 1×4 idle (lobo.png). Celdas LOBO_FRAME_W × LOBO_FRAME_H. */
    self.load.spritesheet('lobo', 'assets/sprites/lobo.png', {
      frameWidth: LOBO_FRAME_W,
      frameHeight: LOBO_FRAME_H
    });
    /* Obstáculos ilustrados (imagen única, sin animación). */
    self.load.image('rocaroja', 'assets/sprites/rocaroja.png');
    self.load.image('mosca', 'assets/sprites/mosca.png');
    self.load.image('sombrero', 'assets/objetos/sombrero.png');
    self.load.image('sirVectorius', 'assets/characters/Sir Vectorius.png');
    self.load.image('secuazDeMad', 'assets/sprites/secuaz_de_mad.png');
    self.load.image('sultan', 'assets/sprites/sultan.png');
    self.load.image('sultan2', 'assets/sprites/sultan2.png');
    self.load.image('sultan3', 'assets/sprites/sultan3.png');
    self.load.image('bombeitor', 'assets/sprites/bombeitor.png');
    self.load.image('dinamita', 'assets/objetos/dinamita.png');
    self.load.image('binocular', 'assets/objetos/binocular.png');
    self.load.image('buho', 'assets/sprites/buho.png');
    self.load.audio('gadgetPenny', 'assets/sonidos/gadget.mp3');
    self.load.audio('loboFeroz', 'assets/sonidos/loboferoz.mp3');
    self.load.audio('kaboom', 'assets/sonidos/Kaboom.mp3');
    self.load.audio('bombeitorExit', 'assets/sonidos/Sfx_51.mp3');
    self.load.audio('jingleInicio', 'assets/sonidos/Jingle_de_inicio.mp3');
    self.load.audio('presionar', 'assets/sonidos/presionar.mp3');
    self.load.audio('intro', 'assets/sonidos/intro.mp3');
    self.load.audio('continuara', 'assets/sonidos/continuara.mp3');
    self.load.audio('gameOver', 'assets/sonidos/19_game_over.mp3');
    self.load.audio('defeatEnding', 'assets/sonidos/17_the_ending.mp3');
    self.load.audio('levelCompleted', 'assets/sonidos/05_level_completed.mp3');
    self.load.audio('victorySwing', 'assets/sonidos/music_swing-triunfo.mp3');
    self.load.audio('moscaAviso', 'assets/sonidos/mosca_aviso.mp3');
    self.load.audio('moscaMuerta', 'assets/sonidos/mosca_muerta.mp3');
    self.load.audio('enjambreMoscas', 'assets/sonidos/enjambre_de_moscas.mp3');
    self.load.audio('ladridoPerro', 'assets/sonidos/ladrido-perro.mp3');
  };
  BootScene.prototype.create = function () {
    /* Diagnóstico del spritesheet: ayuda a detectar PNG con tamaño/recorte equivocado. */
    try {
      if (!this.textures.exists('explorer')) {
        console.warn(
          '[explorer] No se cargó la textura (revisa assets/sprites/penny.png — nombre, ruta y que exista). El juego sigue con personaje de respaldo.'
        );
      } else {
        var tex = this.textures.get('explorer');
        if (tex && tex.source && tex.source[0]) {
          var src = tex.source[0];
          var totalFrames = tex.getFrameNames(false).length;
          console.log(
            '[explorer] PNG ' + src.width + 'x' + src.height +
            ' · frame ' + EXPLORER_FRAME_W + 'x' + EXPLORER_FRAME_H +
            ' · frames detectados: ' + totalFrames +
            ' (esperado: ' + (Math.floor(src.width / EXPLORER_FRAME_W) * Math.floor(src.height / EXPLORER_FRAME_H)) + ')'
          );
          if (src.width % EXPLORER_FRAME_W !== 0 || src.height % EXPLORER_FRAME_H !== 0) {
            console.warn(
              '[explorer] El PNG NO es múltiplo exacto de ' + EXPLORER_FRAME_W + 'x' + EXPLORER_FRAME_H +
              '. Cada fila se desfasará y verás el personaje partido. Reexporta a un tamaño múltiplo.'
            );
          }
        }
      }
    } catch (eDbg) {
      console.warn('[explorer] Diagnóstico:', eDbg && eDbg.message ? eDbg.message : eDbg);
    }
    Medals.ensureMedalFrames(this, 4);
    var bootScene = this;
    if (bootScene.textures) {
      ['mapaBosqueIlustrado', 'mapaMontanasIlustrado', 'mapaDesiertoIlustrado', 'mapaOceanoIlustrado'].forEach(
        function (mk) {
          if (!bootScene.textures.exists(mk)) {
            console.warn('[Caza Tesoro] Textura de mapa NO cargada:', mk);
          } else {
            var mt = bootScene.textures.get(mk);
            var ms = mt && mt.source && mt.source[0];
            if (ms) console.log('[Caza Tesoro] Mapa OK:', mk, ms.width + 'x' + ms.height);
          }
        }
      );
    }
    /* Solo precarga en preload(); al terminar vamos al menú. Sin splash duplicado ni “toca para continuar”.
       (Esa pantalla servía para gesto de usuario/audio y marca; el menú ya recibe el primer clic.) */
    var gameBoot = this.game;
    if (!gameBoot.registry.has('ctcSoundMuted')) {
      gameBoot.registry.set('ctcSoundMuted', false);
    }
    Logic.registerMuteStateGetter(function () {
      try {
        if (gameBoot && gameBoot.registry && gameBoot.registry.has('ctcSoundMuted')) {
          return !!gameBoot.registry.get('ctcSoundMuted');
        }
        return !!(gameBoot && gameBoot.sound && gameBoot.sound.mute);
      } catch (eM) {
        return false;
      }
    });
    this.scene.start('MainMenu');
  };

  /**
   * Overlay F2 en GameScene: PNG completo + rejilla + índice de frame (0…N−1) como en Phaser.
   * Las celdas usadas en la caminata (EXPLORER_WALK_COLUMN) llevan borde verde.
   */
  function toggleExplorerDebug(scene) {
    if (!scene || !scene.textures || !scene.textures.exists('explorer')) return;
    if (scene._explorerDebugLayer) {
      scene._explorerDebugLayer.destroy();
      scene._explorerDebugLayer = null;
      return;
    }
    var tex = scene.textures.get('explorer');
    var src = tex.source && tex.source[0];
    if (!src) return;
    var pngW = src.width;
    var pngH = src.height;
    var cam = scene.cameras.main;
    var maxW = cam.width * 0.55;
    var maxH = cam.height * 0.72;
    var z = Math.min(maxW / pngW, maxH / pngH, 2);
    var ox = 14;
    var oy = 44;
    var layer = scene.add.container(0, 0);
    layer.setScrollFactor(0);
    layer.setDepth(9999);
    var cols = Math.floor(pngW / EXPLORER_FRAME_W);
    var rows = Math.floor(pngH / EXPLORER_FRAME_H);
    var walkSet = {};
    (EXPLORER_WALK_COLUMN || []).forEach(function (ci) {
      walkSet[ci] = true;
    });
    var title = scene.add.text(ox, 8, 'Penny — rejilla del spritesheet (F2 otra vez = cerrar)', {
      fontFamily: 'system-ui, Segoe UI, sans-serif',
      fontSize: '15px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 4
    });
    layer.add(title);
    var sub = scene.add.text(
      ox,
      26,
      'Índice = fila×' +
        EXPLORER_SHEET_COLS +
        ' + col · animación Phaser walk_* · duration ' +
        EXPLORER_MOVE_MS_PER_CELL +
        ' ms/casilla',
      { fontFamily: 'monospace', fontSize: '11px', color: '#c4f0c4', wordWrap: { width: cam.width - 28 } }
    );
    layer.add(sub);
    var footH = 72;
    var extraRW = 108;
    var bg = scene.add
      .rectangle(ox - 6, oy - 6, pngW * z + 12 + extraRW, pngH * z + 12 + footH, 0x000000, 0.82)
      .setOrigin(0, 0);
    layer.add(bg);
    var imgKey = scene.textures.exists('explorerFull') ? 'explorerFull' : 'explorer';
    var img = scene.add.image(ox, oy, imgKey).setOrigin(0, 0).setScale(z);
    layer.add(img);
    var hi = scene.add.graphics();
    hi.lineStyle(2, 0x22ff66, 0.95);
    for (var wr = 0; wr < rows; wr++) {
      for (var wi = 0; wi < EXPLORER_WALK_COLUMN.length; wi++) {
        var cc = EXPLORER_WALK_COLUMN[wi];
        if (cc < 0 || cc >= cols) continue;
        var rx = ox + cc * EXPLORER_FRAME_W * z;
        var ry = oy + wr * EXPLORER_FRAME_H * z;
        hi.strokeRect(rx + 1, ry + 1, EXPLORER_FRAME_W * z - 2, EXPLORER_FRAME_H * z - 2);
      }
    }
    layer.add(hi);
    var grid = scene.add.graphics();
    grid.lineStyle(1, 0xff3b3b, 0.85);
    for (var c = 0; c <= cols; c++) {
      var lx = ox + c * EXPLORER_FRAME_W * z;
      grid.lineBetween(lx, oy, lx, oy + pngH * z);
    }
    for (var r = 0; r <= rows; r++) {
      var ly = oy + r * EXPLORER_FRAME_H * z;
      grid.lineBetween(ox, ly, ox + pngW * z, ly);
    }
    layer.add(grid);
    var n = 0;
    for (var rr = 0; rr < rows; rr++) {
      for (var cc = 0; cc < cols; cc++) {
        var tx = ox + (cc + 0.5) * EXPLORER_FRAME_W * z;
        var ty = oy + (rr + 0.5) * EXPLORER_FRAME_H * z;
        var inWalk = walkSet[cc] === true;
        var lbl = scene.add.text(tx, ty, String(n), {
          fontFamily: 'monospace',
          fontSize: inWalk ? '16px' : '13px',
          color: inWalk ? '#66ff99' : '#ffff66',
          stroke: '#000',
          strokeThickness: 3
        }).setOrigin(0.5);
        layer.add(lbl);
        n++;
      }
    }
    var rowLbls = ['↓ frente', '↑ espalda', '← izq', '→ der'];
    for (var ri = 0; ri < rows && ri < rowLbls.length; ri++) {
      var ly2 = oy + (ri + 0.5) * EXPLORER_FRAME_H * z;
      var rl = scene.add.text(ox + pngW * z + 8, ly2, rowLbls[ri], {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#ddd',
        stroke: '#000',
        strokeThickness: 3
      }).setOrigin(0, 0.5);
      layer.add(rl);
    }
    var info = scene.add.text(
      ox,
      oy + pngH * z + 8,
      'PNG ' +
        pngW +
        '×' +
        pngH +
        ' · celda ' +
        EXPLORER_FRAME_W +
        '×' +
        EXPLORER_FRAME_H +
        ' · ' +
        cols +
        '×' +
        rows +
        ' = ' +
        cols * rows +
        ' celdas' +
        (pngW % EXPLORER_FRAME_W || pngH % EXPLORER_FRAME_H ? '  ¡NO ENCAJA CON LA CELDA!' : '  OK'),
      { fontFamily: 'monospace', fontSize: '12px', color: '#9eff9e', wordWrap: { width: cam.width - 28 } }
    );
    layer.add(info);
    scene._explorerDebugLayer = layer;
  }

  function MainMenu() {
    Phaser.Scene.call(this, { key: 'MainMenu' });
  }
  MainMenu.prototype = Object.create(Phaser.Scene.prototype);
  MainMenu.prototype.constructor = MainMenu;
  MainMenu.prototype.create = function () {
    var self = this;
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var cam = this.cameras.main;
    destroyVictoryHtmlBar();
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    /* Sin fadeIn de cámara: el efecto de Phaser a veces deja la pantalla negra al volver desde
       Victoria / pausa / derrota; resetFX deja el menú visible de inmediato. */
    Transition.prepareSceneCamera(this);
    try {
      cam.resetFX();
      if (typeof cam.setAlpha === 'function') cam.setAlpha(1);
    } catch (eCam) {}
    var menuGrad = this.add.graphics();
    menuGrad.setScrollFactor(0);
    menuGrad.setDepth(-300);
    bindViewportGradient(this, menuGrad);
    var bg;
    if (this.textures.exists('pantallaInicioJuego')) {
      bg = this.add.image(0, 0, 'pantallaInicioJuego');
      layoutMainMenuBgImage(this, bg);
    } else {
      bg = this.add.rectangle(w / 2, h / 2, w, h, 0x1e3a5f, 1);
    }
    bg.setDepth(0);
    var menuFrame = this.add.graphics();
    menuFrame.setScrollFactor(0);
    menuFrame.setDepth(2);
    /** Si no hay PNG de menú: ancho entre degradados laterales. */
    var menuTitleMaxWidthFromViewport = function (viewW) {
      var fadeW = Math.min(Math.max(viewW * 0.22, 64), 260);
      var titlePad = 20;
      return Math.max(120, viewW - 2 * fadeW - 2 * titlePad);
    };
    /**
     * Ancho máximo del texto = panel central de la ilustración (displayWidth tras layoutMainMenuBgImage),
     * no el viewport (si no, el título se dibuja encima de los laterales difuminados).
     */
    var menuTitleMaxWidth = function () {
      var viewW = self.cameras.main.width;
      var titlePad = 24;
      if (bg && bg.active && bg.frame && self.textures.exists('pantallaInicioJuego')) {
        var dw = bg.displayWidth;
        if (dw > 0) {
          return Math.max(80, dw - 2 * titlePad);
        }
      }
      if (bg && bg.active && typeof bg.width === 'number' && bg.width > 0 && !bg.frame) {
        return Math.max(80, bg.width - 2 * titlePad);
      }
      return menuTitleMaxWidthFromViewport(viewW);
    };
    var layoutMenuTitles = function () {
      if (!self.menuTitleMain || !self.menuTitleMain.active) return;
      var ww = self.cameras.main.width;
      var hh = self.cameras.main.height;
      var cam = self.cameras.main;
      var titlePx = Math.round(Math.min(Math.max(20, ww * 0.04), 34));
      var titleMaxW = menuTitleMaxWidth();
      self.menuTitleMain.setFontSize(titlePx + 'px');
      self.menuTitleMain.setWordWrapWidth(titleMaxW, true);
      self.menuTitleMain.setPosition(cam.centerX, Math.max(14, hh * 0.022));
      if (self.menuTitleSub && self.menuTitleSub.active) {
        var subPx = Math.round(Math.min(12, Math.max(10, ww * 0.026))) + 'px';
        self.menuTitleSub.setFontSize(subPx);
        self.menuTitleSub.setWordWrapWidth(titleMaxW, true);
        self.menuTitleSub.setPosition(cam.centerX, self.menuTitleMain.y + self.menuTitleMain.height + 4);
      }
    };
    var layoutMenuBgAndFrame = function () {
      var ww = self.cameras.main.width;
      var hh = self.cameras.main.height;
      if (self.textures.exists('pantallaInicioJuego') && bg && bg.active && bg.frame) {
        layoutMainMenuBgImage(self, bg);
      }
      paintMenuFrameOverlay(menuFrame, ww, hh);
      layoutMenuTitles();
    };
    layoutMenuBgAndFrame();
    if (this.scale && typeof this.scale.on === 'function') this.scale.on('resize', layoutMenuBgAndFrame);
    var titlePx = Math.round(Math.min(Math.max(20, w * 0.04), 34));
    var titleMaxW = menuTitleMaxWidth();
    this.menuTitleMain = this.add
      .text(cam.centerX, Math.max(14, h * 0.022), 'Las Vacaciones Muy Planas de Gadget', {
        fontFamily: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: titlePx + 'px',
        color: '#fffdf7',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: 6,
        align: 'center',
        wordWrap: { width: titleMaxW, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5);
    this.menuTitleSub = this.add
      .text(cam.centerX, this.menuTitleMain.y + this.menuTitleMain.height + 4, 'COORDENADAS EN EL PLANO', {
        fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: Math.round(Math.min(12, Math.max(10, w * 0.026))) + 'px',
        color: '#f0ebe3',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: 4,
        letterSpacing: 2,
        align: 'center',
        wordWrap: { width: titleMaxW, useAdvancedWrap: true }
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5);
    layoutMenuTitles();
    Transition.slideIn(this, 'right', bg);
    this.events.once('shutdown', function () {
      if (self.scale && typeof self.scale.off === 'function') {
        self.scale.off('resize', layoutMenuBgAndFrame);
      }
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });
    this.menuLayer = this.add.container(0, 0);
    this.menuLayer.setDepth(8);
    this.overlayLayer = this.add.container(0, 0);
    this.overlayLayer.setDepth(100);
    Campaign.initRegistry(this.registry);
    this.buildMainButtons(cam);

    ensureBgMusic(this);

    /* Segundo barrido por si el renderer aún arrastra el overlay negro del fade de la escena anterior. */
    this.time.delayedCall(80, function () {
      if (!self.sys || !self.sys.isActive()) return;
      try {
        Transition.prepareSceneCamera(self);
        self.cameras.main.resetFX();
        if (typeof self.cameras.main.setAlpha === 'function') self.cameras.main.setAlpha(1);
      } catch (eR) {}
    });
  };
  MainMenu.prototype.clearOverlay = function () {
    if (this.overlayLayer) this.overlayLayer.removeAll(true);
  };
  MainMenu.prototype.setMenuTitlesVisible = function (vis) {
    if (this.menuTitleMain && this.menuTitleMain.active) this.menuTitleMain.setVisible(vis);
    if (this.menuTitleSub && this.menuTitleSub.active) this.menuTitleSub.setVisible(vis);
  };

  /**
   * Entrada de menú: solo texto + zona clicable (sin caja ni relleno). Phaser Text + Container.
   */
  MainMenu.prototype.createMenuPanelButton = function (label, localX, localY, bw, bh, onClick, clickSound) {
    var self = this;
    var c = this.add.container(localX, localY);
    var underline = this.add.graphics();

    var txt = this.add
      .text(0, 0, label, {
        fontFamily:
          'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '26px',
        color: '#1e1208',
        fontStyle: 'bold',
        stroke: '#fffef8',
        strokeThickness: 4
      })
      .setOrigin(0.5);
    txt.setShadow(0, 2, 'rgba(0,0,0,0.35)', 4, false, true);

    var drawLine = function (visible, pressed) {
      underline.clear();
      if (!visible) return;
      var half = Math.min(txt.width * 0.48, bw * 0.35);
      var ly = txt.y + txt.height * 0.42;
      underline.lineStyle(pressed ? 3 : 2, pressed ? 0x6b4423 : 0xb8860b, 0.95);
      underline.lineBetween(-half, ly, half, ly);
    };

    c.add([underline, txt]);

    c.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-bw / 2, -bh / 2, bw, bh),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });

    var hoverOn = false;
    var pressedOn = false;
    var refresh = function () {
      txt.clearTint();
      if (pressedOn) {
        txt.setAlpha(0.85);
        txt.setY(2);
        txt.setTint(0x4a3018);
        drawLine(true, true);
      } else if (hoverOn) {
        txt.setAlpha(1);
        txt.setY(0);
        txt.setTint(0x8b5a2b);
        drawLine(true, false);
      } else {
        txt.setAlpha(1);
        txt.setY(0);
        drawLine(false, false);
      }
    };

    c.on('pointerover', function () {
      hoverOn = true;
      refresh();
    });
    c.on('pointerout', function () {
      hoverOn = false;
      pressedOn = false;
      refresh();
    });
    c.on('pointerdown', function () {
      pressedOn = true;
      refresh();
    });
    c.on('pointerup', function () {
      pressedOn = false;
      refresh();
    });

    refresh();
    ButtonFx.bindAnimatedButton(self, c, onClick, {
      disableIdlePulse: true,
      clickSound: clickSound || 'menu'
    });
    return c;
  };

  /**
   * Botón redondeado (estilo prólogo / misión): primario, secundario o pergamino.
   */
  MainMenu.prototype.buildMenuChromeButton = function (cx, cy, label, onClick, opts) {
    var self = this;
    opts = opts || {};
    var variant = opts.variant || 'primary';
    var fs = opts.fontSize || (variant === 'secondary' ? 15 : variant === 'parchment' ? 16 : 18);
    var family = opts.family || 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var padX = opts.paddingX != null ? opts.paddingX : variant === 'parchment' ? 26 : variant === 'secondary' ? 22 : 28;
    var padY = opts.paddingY != null ? opts.paddingY : variant === 'parchment' ? 11 : variant === 'secondary' ? 10 : 13;
    var topColor =
      opts.topColor != null
        ? opts.topColor
        : variant === 'parchment'
          ? 0xc9a227
          : variant === 'secondary'
            ? 0x334155
            : 0x22c55e;
    var botColor =
      opts.botColor != null
        ? opts.botColor
        : variant === 'parchment'
          ? 0x8b5a2b
          : variant === 'secondary'
            ? 0x1e293b
            : 0x15803d;
    var borderColor =
      opts.borderColor != null
        ? opts.borderColor
        : variant === 'parchment'
          ? 0x5c3d1e
          : variant === 'secondary'
            ? 0xfef3c7
            : 0x064e2a;
    var depth = opts.depth || 96;
    var textColor =
      opts.textColor ||
      (variant === 'parchment' ? '#fffef8' : variant === 'secondary' ? '#fef3c7' : '#ffffff');
    var strokeColor =
      opts.strokeColor ||
      (variant === 'parchment' ? '#3d2814' : variant === 'secondary' ? '#0f172a' : '#052e16');

    var probe = this.add
      .text(0, 0, label, { fontFamily: family, fontSize: fs + 'px', fontStyle: 'bold' })
      .setVisible(false);
    var tw = probe.width;
    var th = probe.height;
    probe.destroy();

    var bw = Math.max(variant === 'parchment' ? 168 : 132, tw + padX * 2);
    var bh = th + padY * 2;
    var r = Math.min(bh / 2, variant === 'parchment' ? 24 : 28);

    var container = this.add.container(cx, cy).setDepth(depth).setScrollFactor(0);

    var shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillRoundedRect(-bw / 2 + 2, -bh / 2 + 5, bw, bh, r);
    container.add(shadow);

    var bg = this.add.graphics();
    if (variant === 'secondary') {
      bg.fillStyle(0x0f172a, 0.72);
      bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
    } else {
      bg.fillGradientStyle(topColor, topColor, botColor, botColor, 1, 1, 1, 1);
      bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
      bg.fillStyle(0xffffff, variant === 'parchment' ? 0.22 : 0.2);
      bg.fillRoundedRect(-bw / 2 + 4, -bh / 2 + 3, bw - 8, bh * 0.42, { tl: r - 4, tr: r - 4, bl: 4, br: 4 });
    }
    bg.lineStyle(2, borderColor, 0.92);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
    container.add(bg);

    var txt = this.add
      .text(0, 0, label, {
        fontFamily: family,
        fontSize: fs + 'px',
        color: textColor,
        fontStyle: 'bold',
        stroke: strokeColor,
        strokeThickness: variant === 'parchment' ? 3 : 4
      })
      .setOrigin(0.5);
    container.add(txt);

    var hit = this.add.zone(0, 0, bw, bh).setInteractive({ useHandCursor: true });
    container.add(hit);

    var hoverTw = null;
    function isAlive() {
      return container && container.active && container.scene === self && self.sys && self.sys.isActive();
    }
    var resetTw = function () {
      if (hoverTw) {
        try {
          if (hoverTw.stop) hoverTw.stop();
        } catch (eStop) {}
        hoverTw = null;
      }
      if (isAlive() && self.tweens) self.tweens.killTweensOf(container);
    };
    hit.on('pointerover', function () {
      if (!isAlive()) return;
      resetTw();
      hoverTw = self.tweens.add({
        targets: container,
        scale: 1.04,
        duration: 130,
        ease: 'Sine.easeOut'
      });
    });
    hit.on('pointerout', function () {
      if (!isAlive()) return;
      resetTw();
      hoverTw = self.tweens.add({ targets: container, scale: 1, duration: 130, ease: 'Sine.easeIn' });
    });
    hit.on('pointerdown', function () {
      if (!isAlive()) return;
      self.tweens.add({
        targets: container,
        scale: 0.96,
        duration: 80,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
    });
    ButtonFx.bindAnimatedButton(self, hit, onClick, {
      disableIdlePulse: true,
      disablePressPop: true,
      clickSound: opts.clickSound || 'menu'
    });
    self.events.once('shutdown', function () {
      hit.removeAllListeners();
      resetTw();
    });
    return container;
  };

  MainMenu.prototype.addBackButton = function (w, h, opts) {
    var self = this;
    opts = opts || {};
    if (opts.styled) {
      var cy = opts.y != null ? opts.y : h - 36;
      var cx = opts.x != null ? opts.x : w / 2;
      var btn = this.buildMenuChromeButton(
        cx,
        cy,
        opts.label || '← Volver al menú',
        function () {
          self.clearOverlay();
          self.buildMainButtons(self.cameras.main);
        },
        { variant: opts.variant || 'parchment', depth: opts.depth || 98, fontSize: opts.fontSize }
      );
      this.overlayLayer.add(btn);
      return btn;
    }
    var back = this.add
      .text(w / 2, h - 36, 'Volver', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#2563eb',
        padding: { x: 16, y: 8 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    ButtonFx.bindAnimatedButton(
      self,
      back,
      function () {
        self.clearOverlay();
        self.buildMainButtons(self.cameras.main);
      },
      { clickSound: 'menu' }
    );
    this.overlayLayer.add(back);
  };
  MainMenu.prototype.buildMainButtons = function (cam) {
    var self = this;
    this.clearOverlay();
    this.menuLayer.removeAll(true);
    this.setMenuTitlesVisible(true);

    var w = cam.width;
    var h = cam.height;
    var cx = cam.centerX;
    var cy = cam.centerY;
    var btnW = Math.min(w * 0.88, 520);
    var btnH = 46;
    var gap = 14;
    var stackH = 4 * btnH + 3 * gap;
    /* El pergamino del arte está más abajo que el centro del canvas; bajamos el bloque. */
    var menuMidY = cy + h * 0.17;
    var y0 = menuMidY - stackH / 2 + btnH / 2;

    var addPanelBtn = function (label, index, onClick, clickSound) {
      var y = y0 + index * (btnH + gap);
      var btn = self.createMenuPanelButton(label, cx, y, btnW, btnH, onClick, clickSound);
      self.menuLayer.add(btn);
    };

    addPanelBtn('Modos de juego', 0, function () {
      self.openGameModesInfo(w, h);
    });
    /* «Campaña» arranca la aventura: jingle de inicio en vez del click corto. */
    addPanelBtn('Campaña', 1, function () {
      if (isMenuInputGuarded(self.game)) return;
      Campaign.startCampaign(self.registry);
      self.registry.set('selectedLevel', 1);
      clearComicIntroPlayed();
      self.registry.set('starsTotal', 0);
      self.registry.set('starsPerLevel', {});
      Medals.resetMedalProgress(self.registry);
      startMissionFromMenu(self, 0);
    }, 'start');
    addPanelBtn('Modo libre', 2, function () {
      Campaign.enterFreePractice(self.registry);
      self.openFreeModeSelect(w, h);
    });
    addPanelBtn('Créditos', 3, function () {
      self.openCredits(w, h);
    });

    var lastBtnCenterY = y0 + 3 * (btnH + gap);
    var sndY = Math.min(h - 36, lastBtnCenterY + btnH * 0.5 + 28);
    var snd = mountSoundToggle(self, {
      x: cx,
      y: sndY,
      size: 'menu',
      depth: 500,
      pulse: false
    });
    if (snd) self.menuLayer.add(snd);

    var guardUntil = self.registry.get('ctcMenuInputGuardUntil');
    if (guardUntil && Date.now() < guardUntil && self.input) {
      self.input.enabled = false;
      self.time.delayedCall(Math.max(80, guardUntil - Date.now()), function () {
        if (self.sys && self.sys.isActive() && self.input) self.input.enabled = true;
      });
    }
  };
  /** Explica Campaña, Modo libre y códigos del álbum (pantalla aparte, sin saturar el menú). */
  MainMenu.prototype.openGameModesInfo = function (w, h) {
    var self = this;
    Campaign.initRegistry(this.registry);
    this.setMenuTitlesVisible(false);
    this.menuLayer.removeAll(true);
    this.clearOverlay();

    var compact = w < 520 || h < 620;
    var sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var serif = 'Georgia, "Times New Roman", serif';
    var cx = w / 2;
    var panelW = Math.min(w * 0.92, 500);
    var pad = compact ? 16 : 22;
    var innerW = panelW - pad * 2;
    var footerH = compact ? 58 : 64;
    var headerH = compact ? 52 : 58;
    var sectionGap = compact ? 12 : 16;

    var measure = function (txt, style) {
      var t = self.add.text(0, 0, txt, style).setVisible(false);
      var sz = { w: t.width, h: t.height };
      t.destroy();
      return sz;
    };

    var bodyStyle = {
      fontFamily: sans,
      fontSize: (compact ? 13 : 14) + 'px',
      color: '#334155',
      wordWrap: { width: innerW - (compact ? 16 : 20) },
      lineSpacing: compact ? 4 : 5
    };
    var noteStyle = {
      fontFamily: sans,
      fontSize: (compact ? 12 : 13) + 'px',
      color: '#5c3d1e',
      fontStyle: 'italic',
      wordWrap: { width: innerW - (compact ? 24 : 28) },
      lineSpacing: 4
    };

    var sections = AlbumCodes.GAME_MODES_SECTIONS || [];
    var blocksH = 0;
    for (var mi = 0; mi < sections.length; mi++) {
      blocksH += compact ? 20 : 24;
      blocksH += measure(sections[mi].body, bodyStyle).h;
      if (sections[mi].note) {
        blocksH += compact ? 10 : 12;
        blocksH += measure('📝  ' + sections[mi].note, noteStyle).h + (compact ? 14 : 16);
      }
      blocksH += sectionGap;
    }

    var footerGap = compact ? 20 : 24;
    var panelH = Math.min(h * 0.92, headerH + blocksH + footerH + footerGap + pad);
    var panelX = cx - panelW / 2;
    var panelY = Math.max(compact ? 10 : 16, (h - panelH) / 2);

    var backdrop = this.add.rectangle(cx, h / 2, w, h, 0x0f172a, 0.78).setDepth(90);
    this.overlayLayer.add(backdrop);

    var shadow = this.add.graphics().setDepth(91);
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillRoundedRect(panelX + 4, panelY + 6, panelW, panelH, 18);
    this.overlayLayer.add(shadow);

    var paper = this.add.graphics().setDepth(92);
    paper.fillStyle(0xfff6e3, 0.99);
    paper.fillRoundedRect(panelX, panelY, panelW, panelH, 18);
    paper.lineStyle(3, 0x8b5a2b, 1);
    paper.strokeRoundedRect(panelX, panelY, panelW, panelH, 18);
    this.overlayLayer.add(paper);

    var header = this.add.graphics().setDepth(93);
    header.fillStyle(0xf5e6c8, 1);
    header.fillRoundedRect(panelX + 2, panelY + 2, panelW - 4, headerH, {
      tl: 16,
      tr: 16,
      bl: 0,
      br: 0
    });
    header.lineStyle(1, 0xc9a227, 0.6);
    header.lineBetween(panelX + pad, panelY + headerH, panelX + panelW - pad, panelY + headerH);
    this.overlayLayer.add(header);

    this.overlayLayer.add(
      this.add
        .text(cx, panelY + (compact ? 14 : 16), 'Modos de juego', {
          fontFamily: serif,
          fontSize: (compact ? 22 : 26) + 'px',
          color: '#1a1208',
          fontStyle: 'bold',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(94)
    );

    var y = panelY + headerH + (compact ? 12 : 14);
    var textX = panelX + pad + (compact ? 8 : 10);

    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var accent = this.add.graphics().setDepth(93);
      var blockTop = y;
      var titleSz = measure(sec.title, {
        fontFamily: serif,
        fontSize: (compact ? 15 : 17) + 'px',
        fontStyle: 'bold'
      });
      var bodySz = measure(sec.body, bodyStyle);
      var noteSz = sec.note ? measure(sec.note, noteStyle) : { w: 0, h: 0 };
      var blockH =
        titleSz.h +
        6 +
        bodySz.h +
        (sec.note ? 10 + noteSz.h + (compact ? 12 : 14) : 0) +
        (compact ? 10 : 12);

      accent.fillStyle(0xfdf8ef, 0.95);
      accent.fillRoundedRect(panelX + pad, blockTop, innerW, blockH, 10);
      accent.lineStyle(1, 0xe7d5b3, 1);
      accent.strokeRoundedRect(panelX + pad, blockTop, innerW, blockH, 10);
      accent.fillStyle(0xb8860b, 1);
      accent.fillRoundedRect(panelX + pad, blockTop, 5, blockH, { tl: 10, bl: 10, tr: 0, br: 0 });
      this.overlayLayer.add(accent);

      this.overlayLayer.add(
        this.add
          .text(textX, y + (compact ? 6 : 8), sec.title, {
            fontFamily: serif,
            fontSize: (compact ? 15 : 17) + 'px',
            color: '#78350f',
            fontStyle: 'bold'
          })
          .setOrigin(0, 0)
          .setDepth(94)
      );
      y += titleSz.h + (compact ? 8 : 10);

      var bodyTxt = this.add.text(textX, y, sec.body, bodyStyle).setOrigin(0, 0).setDepth(94);
      this.overlayLayer.add(bodyTxt);
      y += bodyTxt.height + (compact ? 8 : 10);

      if (sec.note) {
        var notePad = compact ? 8 : 10;
        var noteBoxH = noteSz.h + notePad * 2;
        var noteGfx = this.add.graphics().setDepth(93);
        noteGfx.fillStyle(0xfef3c7, 1);
        noteGfx.fillRoundedRect(textX - 4, y, innerW - (compact ? 12 : 16), noteBoxH, 8);
        noteGfx.lineStyle(1, 0xd97706, 0.85);
        noteGfx.strokeRoundedRect(textX - 4, y, innerW - (compact ? 12 : 16), noteBoxH, 8);
        this.overlayLayer.add(noteGfx);

        this.overlayLayer.add(
          this.add
            .text(textX + (compact ? 2 : 4), y + notePad, '📝  ' + sec.note, noteStyle)
            .setOrigin(0, 0)
            .setDepth(94)
        );
        y += noteBoxH + (compact ? 8 : 10);
      }

      y += sectionGap;
    }

    /* Separador y botón debajo del contenido real (evita línea atravesando el último texto). */
    var contentEndY = y - sectionGap;
    var footerLineY = contentEndY + footerGap;
    var footerY = footerLineY + (compact ? 34 : 38);
    var footerLine = this.add.graphics().setDepth(95);
    footerLine.lineStyle(1, 0xd6c4a8, 0.9);
    footerLine.lineBetween(panelX + pad, footerLineY, panelX + panelW - pad, footerLineY);
    this.overlayLayer.add(footerLine);

    var backBtn = this.buildMenuChromeButton(
      cx,
      footerY,
      '← Volver al menú',
      function () {
        self.clearOverlay();
        self.buildMainButtons(self.cameras.main);
      },
      { variant: 'parchment', depth: 98, fontSize: compact ? 15 : 16 }
    );
    this.overlayLayer.add(backBtn);

  };

  /** Miniatura del mapa para tarjetas del selector (modo libre). */
  MainMenu.prototype.addWorldMapThumb = function (cx, cy, levelIdx, size, depth) {
    var lv = levels[levelIdx];
    var resolved = lv ? resolveLevelMapTexture(this, lv) : null;
    var d = depth != null ? depth : 94;
    var half = size / 2;
    if (resolved && resolved.key && this.textures.exists(resolved.key)) {
      var img = this.add.image(cx, cy, resolved.key).setDepth(d);
      var scale = Math.max(size / img.width, size / img.height);
      img.setScale(scale);
      var frame = this.add.graphics().setDepth(d + 1);
      frame.fillStyle(0xe7d5b3, 0.35);
      frame.fillRoundedRect(cx - half, cy - half, size, size, 8);
      frame.lineStyle(2, 0x8b5a2b, 0.9);
      frame.strokeRoundedRect(cx - half, cy - half, size, size, 8);
      return { img: img, frame: frame };
    }
    var icons = ['🌳', '🏔️', '🏜️', '🌊'];
    return {
      img: this.add
        .text(cx, cy, icons[levelIdx] || '•', { fontSize: Math.round(size * 0.55) + 'px' })
        .setOrigin(0.5)
        .setDepth(d)
    };
  };

  /**
   * Selector de mundo en modo libre: tarjetas con miniatura, objetivos y botones unificados.
   */
  MainMenu.prototype.openFreeModeSelect = function (w, h) {
    var self = this;
    Campaign.enterFreePractice(this.registry);
    this.setMenuTitlesVisible(false);
    this.menuLayer.removeAll(true);
    this.clearOverlay();

    var compact = w < 520 || h < 620;
    var sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var serif = 'Georgia, "Times New Roman", serif';
    var cx = w / 2;
    var panelW = Math.min(w * 0.94, 500);
    var panelX = cx - panelW / 2;
    var pad = compact ? 14 : 18;
    var innerW = panelW - pad * 2;
    var thumbSize = compact ? 52 : 62;
    var btnColW = compact ? 88 : 96;
    var textW = innerW - thumbSize - btnColW - (compact ? 20 : 28);
    var headerH = compact ? 48 : 54;
    var footerH = compact ? 56 : 62;
    var cardGap = compact ? 8 : 10;
    var cardCount = levels.length;
    var listTop = 0;
    var cardH = compact ? 108 : 118;
    var panelH = headerH + cardCount * cardH + (cardCount - 1) * cardGap + footerH + pad;
    panelH = Math.min(h * 0.92, panelH);
    cardH = Math.floor((panelH - headerH - footerH - pad - (cardCount - 1) * cardGap) / cardCount);
    cardH = Math.max(compact ? 100 : 108, cardH);
    panelH = headerH + cardCount * cardH + (cardCount - 1) * cardGap + footerH + pad;
    var panelY = Math.max(compact ? 8 : 12, (h - panelH) / 2);
    listTop = panelY + headerH + (compact ? 8 : 10);

    var backdrop = this.add.rectangle(cx, h / 2, w, h, 0x0f172a, 0.78).setDepth(90);
    this.overlayLayer.add(backdrop);

    var shadow = this.add.graphics().setDepth(91);
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillRoundedRect(panelX + 4, panelY + 6, panelW, panelH, 16);
    this.overlayLayer.add(shadow);

    var paper = this.add.graphics().setDepth(92);
    paper.fillStyle(0xfff6e3, 0.99);
    paper.fillRoundedRect(panelX, panelY, panelW, panelH, 16);
    paper.lineStyle(3, 0x8b5a2b, 1);
    paper.strokeRoundedRect(panelX, panelY, panelW, panelH, 16);
    this.overlayLayer.add(paper);

    var headerGfx = this.add.graphics().setDepth(93);
    headerGfx.fillStyle(0xf5e6c8, 1);
    headerGfx.fillRoundedRect(panelX + 2, panelY + 2, panelW - 4, headerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    this.overlayLayer.add(headerGfx);

    this.overlayLayer.add(
      this.add
        .text(cx, panelY + (compact ? 12 : 14), 'Modo libre', {
          fontFamily: serif,
          fontSize: (compact ? 22 : 26) + 'px',
          color: '#1a1208',
          fontStyle: 'bold',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(94)
    );
    this.overlayLayer.add(
      this.add
        .text(cx, panelY + (compact ? 38 : 42), 'Elegí un mundo · sin códigos del álbum', {
          fontFamily: sans,
          fontSize: (compact ? 11 : 12) + 'px',
          color: '#57534e',
          fontStyle: 'italic',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(94)
    );

    var titleStyle = {
      fontFamily: serif,
      fontSize: (compact ? 14 : 15) + 'px',
      color: '#78350f',
      fontStyle: 'bold'
    };
    var bodyStyle = {
      fontFamily: sans,
      fontSize: (compact ? 11 : 12) + 'px',
      color: '#334155',
      wordWrap: { width: textW },
      lineSpacing: compact ? 2 : 3
    };

    /* Parte 1 jugable: Bosque + Montañas. Los mundos 3–4 quedan como
       adelanto («Próximamente») hasta la segunda parte de la aventura. */
    var PART1_LAST_IDX = 1;

    var yCard = listTop;
    for (var i = 0; i < cardCount; i++) {
      var lv = levels[i];
      var worldName = Medals.MEDAL_LEVEL_NAMES[i] || 'Mundo ' + (i + 1);
      var desc = lv && lv.description ? lv.description : '';
      var disponible = i <= PART1_LAST_IDX;
      var objLines = [];
      if (disponible) {
        var objs = (lv && lv.objetivos) || [];
        for (var oi = 0; oi < objs.length && oi < 2; oi++) {
          objLines.push('· ' + objs[oi]);
        }
        if (objs.length > 2) objLines.push('· …');
      } else {
        objLines.push('🔒 Disponible en la segunda parte de la aventura.');
      }

      (function (levelIdx, cardY, abierto) {
        var cardX = panelX + pad;
        var cardInnerW = panelW - pad * 2;
        var cardGfx = self.add.graphics().setDepth(93);
        cardGfx.fillStyle(0xfdf8ef, 0.98);
        cardGfx.fillRoundedRect(cardX, cardY, cardInnerW, cardH, 10);
        cardGfx.lineStyle(1, 0x0f766e, 0.35);
        cardGfx.strokeRoundedRect(cardX, cardY, cardInnerW, cardH, 10);
        self.overlayLayer.add(cardGfx);

        var thumbCx = cardX + thumbSize / 2 + (compact ? 6 : 8);
        var thumbCy = cardY + cardH / 2;
        var thumbParts = self.addWorldMapThumb(thumbCx, thumbCy, levelIdx, thumbSize, 94);
        if (thumbParts && thumbParts.img) {
          if (!abierto && thumbParts.img.setAlpha) thumbParts.img.setAlpha(0.45);
          self.overlayLayer.add(thumbParts.img);
        }
        if (thumbParts && thumbParts.frame) {
          if (!abierto && thumbParts.frame.setAlpha) thumbParts.frame.setAlpha(0.7);
          self.overlayLayer.add(thumbParts.frame);
        }

        var textX = cardX + thumbSize + (compact ? 14 : 18);
        var textY = cardY + (compact ? 8 : 10);
        self.overlayLayer.add(
          self.add.text(textX, textY, worldName, titleStyle).setOrigin(0, 0).setDepth(94)
        );
        textY += compact ? 18 : 20;
        if (desc) {
          var descTxt = self.add.text(textX, textY, desc, bodyStyle).setOrigin(0, 0).setDepth(94);
          self.overlayLayer.add(descTxt);
          textY += descTxt.height + (compact ? 2 : 4);
        }
        if (objLines.length) {
          self.overlayLayer.add(
            self.add.text(textX, textY, objLines.join('\n'), bodyStyle).setOrigin(0, 0).setDepth(94)
          );
        }

        if (abierto) {
          var enterBtn = self.buildMenuChromeButton(
            cardX + cardInnerW - btnColW / 2 - (compact ? 6 : 8),
            cardY + cardH / 2,
            'Entrar',
            function () {
              self.registry.set('selectedLevel', levelIdx + 1);
              self.clearOverlay();
              startMissionFromMenu(self, levelIdx);
            },
            {
              variant: 'primary',
              depth: 96,
              fontSize: compact ? 14 : 15,
              paddingX: compact ? 16 : 18,
              paddingY: compact ? 8 : 9,
              /* Entrar a un mundo = empezar capítulo: jingle de inicio. */
              clickSound: 'start'
            }
          );
          self.overlayLayer.add(enterBtn);
        } else {
          var soonTxt = self.add
            .text(
              cardX + cardInnerW - btnColW / 2 - (compact ? 6 : 8),
              cardY + cardH / 2,
              'Próximamente',
              {
                fontFamily: sans,
                fontSize: (compact ? 12 : 13) + 'px',
                color: '#92400e',
                fontStyle: 'bold italic',
                align: 'center',
                wordWrap: { width: btnColW }
              }
            )
            .setOrigin(0.5)
            .setDepth(96);
          self.overlayLayer.add(soonTxt);
        }
      })(i, yCard, disponible);

      yCard += cardH + cardGap;
    }

    var footerLineY = yCard + (compact ? 4 : 6);
    var footerY = footerLineY + (compact ? 32 : 36);
    var footerLine = self.add.graphics().setDepth(95);
    footerLine.lineStyle(1, 0xd6c4a8, 0.9);
    footerLine.lineBetween(panelX + pad, footerLineY, panelX + panelW - pad, footerLineY);
    self.overlayLayer.add(footerLine);

    var backBtn = self.buildMenuChromeButton(
      cx,
      footerY,
      '← Volver al menú',
      function () {
        self.clearOverlay();
        self.buildMainButtons(self.cameras.main);
      },
      { variant: 'parchment', depth: 98, fontSize: compact ? 15 : 16 }
    );
    self.overlayLayer.add(backBtn);
  };
  /** Bloques de créditos (contenido académico y legales breves). */
  var CREDITS_SECTIONS = [
    {
      title: 'Dirección del proyecto',
      body: 'Luis Valencia'
    },
    {
      title: 'Inspiración',
      body:
        'Basado en la serie animada original Inspector Gadget (1983–1986), ' +
        'producida por DiC Entertainment para televisión.\n\n' +
        'Episodio «Aquí no queremos moscas» (No Flies on Us), temporada 1, episodio 43. ' +
        'No se basa en versiones posteriores de la franquicia.\n\n' +
        'Proyecto educativo sin fines comerciales.'
    },
    {
      title: 'Audio',
      body:
        '· Intro y música del menú: material sonoro de Inspector Gadget (serie original, 1983–1986).\n\n' +
        '· Algunos efectos: Double Dragon II: The Revenge (NES, 1989) · Technos Japan.\n\n' +
        '· Otros efectos del juego: generados o editados con herramientas de IA para este proyecto.'
    },
    {
      title: 'Desarrollo asistido',
      body: 'Google Gemini · apoyo creativo\nCursor · programación del juego'
    },
    {
      title: 'Tecnología',
      body: 'Phaser 3 · HTML5 / JavaScript'
    }
  ];

  MainMenu.prototype.openCredits = function (w, h) {
    var self = this;
    var compact = w < 520 || h < 620;
    this.setMenuTitlesVisible(false);
    this.menuLayer.removeAll(true);
    this.clearOverlay();

    var sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var serif = 'Georgia, "Times New Roman", serif';
    var cx = w / 2;
    var panelW = Math.min(w * 0.92, 500);
    var panelX = cx - panelW / 2;
    var pad = compact ? 14 : 18;
    var innerW = panelW - pad * 2;
    var headerH = compact ? 56 : 62;
    var footerH = compact ? 72 : 80;
    var sectionGap = compact ? 10 : 12;
    var textX = panelX + pad + (compact ? 8 : 10);

    var measure = function (txt, style) {
      var t = self.add.text(0, 0, txt, style).setVisible(false);
      var sz = { w: t.width, h: t.height };
      t.destroy();
      return sz;
    };

    var titleStyle = {
      fontFamily: serif,
      fontSize: (compact ? 14 : 15) + 'px',
      color: '#78350f',
      fontStyle: 'bold'
    };
    var bodyStyle = {
      fontFamily: sans,
      fontSize: (compact ? 11 : 12) + 'px',
      color: '#334155',
      wordWrap: { width: innerW - (compact ? 16 : 20) },
      lineSpacing: compact ? 3 : 4
    };
    var sections = CREDITS_SECTIONS;
    var blocksH = 0;
    for (var mi = 0; mi < sections.length; mi++) {
      var mTitle = measure(sections[mi].title, titleStyle);
      var mBody = measure(sections[mi].body, bodyStyle);
      blocksH += mTitle.h + 6 + mBody.h + (compact ? 8 : 10) + sectionGap;
    }

    var footerGap = compact ? 16 : 20;
    var panelH = Math.min(h * 0.92, headerH + blocksH + footerH + footerGap + pad);
    var panelY = Math.max(compact ? 8 : 12, (h - panelH) / 2);

    var backdrop = this.add.rectangle(cx, h / 2, w, h, 0x0f172a, 0.78).setDepth(90);
    this.overlayLayer.add(backdrop);

    var shadow = this.add.graphics().setDepth(91);
    shadow.fillStyle(0x000000, 0.28);
    shadow.fillRoundedRect(panelX + 4, panelY + 6, panelW, panelH, 16);
    this.overlayLayer.add(shadow);

    var paper = this.add.graphics().setDepth(92);
    paper.fillStyle(0xfff6e3, 0.99);
    paper.fillRoundedRect(panelX, panelY, panelW, panelH, 16);
    paper.lineStyle(3, 0x8b5a2b, 1);
    paper.strokeRoundedRect(panelX, panelY, panelW, panelH, 16);
    this.overlayLayer.add(paper);

    var headerGfx = this.add.graphics().setDepth(93);
    headerGfx.fillStyle(0xf5e6c8, 1);
    headerGfx.fillRoundedRect(panelX + 2, panelY + 2, panelW - 4, headerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    headerGfx.lineStyle(1, 0xc9a227, 0.6);
    headerGfx.lineBetween(panelX + pad, panelY + headerH, panelX + panelW - pad, panelY + headerH);
    this.overlayLayer.add(headerGfx);

    this.overlayLayer.add(
      this.add
        .text(cx, panelY + (compact ? 12 : 14), 'Créditos', {
          fontFamily: serif,
          fontSize: (compact ? 22 : 26) + 'px',
          color: '#1a1208',
          fontStyle: 'bold',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(94)
    );
    this.overlayLayer.add(
      this.add
        .text(cx, panelY + (compact ? 38 : 42), 'Caza del Tesoro Cartesiano', {
          fontFamily: sans,
          fontSize: (compact ? 11 : 12) + 'px',
          color: '#57534e',
          fontStyle: 'italic',
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(94)
    );

    var y = panelY + headerH + (compact ? 10 : 12);
    for (var si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var titleSz = measure(sec.title, titleStyle);
      var bodySz = measure(sec.body, bodyStyle);
      var blockH = titleSz.h + 6 + bodySz.h + (compact ? 8 : 10);

      var accent = this.add.graphics().setDepth(93);
      accent.fillStyle(0xfdf8ef, 0.98);
      accent.fillRoundedRect(panelX + pad, y, innerW, blockH, 10);
      accent.lineStyle(1, 0xe7d5b3, 1);
      accent.strokeRoundedRect(panelX + pad, y, innerW, blockH, 10);
      accent.fillStyle(0xb8860b, 1);
      accent.fillRoundedRect(panelX + pad, y, 5, blockH, { tl: 10, bl: 10, tr: 0, br: 0 });
      this.overlayLayer.add(accent);

      this.overlayLayer.add(
        this.add.text(textX, y + (compact ? 6 : 8), sec.title, titleStyle).setOrigin(0, 0).setDepth(94)
      );
      var bodyTxt = this.add
        .text(textX, y + (compact ? 6 : 8) + titleSz.h + 4, sec.body, bodyStyle)
        .setOrigin(0, 0)
        .setDepth(94);
      this.overlayLayer.add(bodyTxt);
      y += blockH + sectionGap;
    }

    var footerLineY = panelY + panelH - footerH + (compact ? 6 : 8);
    var footerY = footerLineY + (compact ? 30 : 34);
    var footerLine = this.add.graphics().setDepth(95);
    footerLine.lineStyle(1, 0xd6c4a8, 0.9);
    footerLine.lineBetween(panelX + pad, footerLineY, panelX + panelW - pad, footerLineY);
    this.overlayLayer.add(footerLine);

    var backBtn = this.buildMenuChromeButton(
      cx,
      footerY,
      '← Volver al menú',
      function () {
        self.clearOverlay();
        self.buildMainButtons(self.cameras.main);
      },
      { variant: 'parchment', depth: 98, fontSize: compact ? 15 : 16 }
    );
    this.overlayLayer.add(backBtn);
  };
  /* ============================================================
   * Utilidades comunes para PreLevelScene y PostLevelScene
   * ------------------------------------------------------------
   * Mantener todo dentro del IIFE evita pisar `window.*`.
   * ============================================================ */
  function buildLessonPanel(scene) {
    var w = scene.cameras.main.width;
    var h = scene.cameras.main.height;
    scene.panelW = Math.min(w * 0.92, 620);
    scene.panelH = Math.min(h * 0.88, 560);
    scene.panelX = w / 2 - scene.panelW / 2;
    scene.panelY = h / 2 - scene.panelH / 2;
    var panel = scene.add.graphics();
    panel.fillStyle(0xfff6e3, 0.96);
    panel.fillRoundedRect(scene.panelX, scene.panelY, scene.panelW, scene.panelH, 18);
    panel.lineStyle(3, 0x8b5a2b, 1);
    panel.strokeRoundedRect(scene.panelX, scene.panelY, scene.panelW, scene.panelH, 18);
    panel.setDepth(10);
    scene.panel = panel;
    scene.content = scene.add.container(0, 0);
    scene.content.setDepth(20);
  }

  function addLessonText(scene, x, y, txt, style, originX, originY) {
    var t = scene.add
      .text(x, y, txt, style)
      .setOrigin(originX != null ? originX : 0, originY != null ? originY : 0)
      .setScrollFactor(0);
    scene.content.add(t);
    return t;
  }

  function makeLessonButton(scene, cx, cy, label, color, onClick) {
    var btn = scene.add
      .text(cx, cy, label, {
        fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: color || '#0d9488',
        padding: { x: 18, y: 10 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    ButtonFx.bindAnimatedButton(scene, btn, onClick);
    scene.content.add(btn);
    return btn;
  }

  /* Paleta de fondo por nivel: gradiente vertical (top → middle → bottom).
     Tonos saturados pero oscuros para que el panel pergamino destaque. */
  var LEVEL_BG_GRADIENT = [
    { top: 0x12361f, mid: 0x215a35, bot: 0x3a7a47 }, // 1 Bosque
    { top: 0x111e33, mid: 0x2c4a72, bot: 0x6b8fb8 }, // 2 Montañas
    { top: 0x4a1f06, mid: 0xa4541a, bot: 0xe09a3d }, // 3 Desierto
    { top: 0x05172e, mid: 0x0e4671, bot: 0x2b8fc9 }  // 4 Océano
  ];

  /** Pinta un gradiente vertical de tres tonos (top→mid→bot) en un Graphics. */
  function paintLevelGradient(gfx, w, h, palette) {
    if (!gfx || !gfx.active) return;
    gfx.clear();
    var half = Math.floor(h / 2);
    gfx.fillGradientStyle(palette.top, palette.top, palette.mid, palette.mid, 1, 1, 1, 1);
    gfx.fillRect(0, 0, w, half);
    gfx.fillGradientStyle(palette.mid, palette.mid, palette.bot, palette.bot, 1, 1, 1, 1);
    gfx.fillRect(0, half, w, h - half);
    /* Viñeta sutil: oscurece los bordes laterales para enfocar el panel. */
    var fadeW = Math.min(Math.max(w * 0.25, 60), 280);
    gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    gfx.fillRect(0, 0, fadeW, h);
    gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    gfx.fillRect(w - fadeW, 0, fadeW, h);
  }

  function paintLessonBackdrop(scene) {
    var w = scene.cameras.main.width;
    var h = scene.cameras.main.height;
    scene.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    var idx = (scene.levelIndex != null) ? scene.levelIndex : 0;
    var palette = LEVEL_BG_GRADIENT[idx] || LEVEL_BG_GRADIENT[0];

    var grad = scene.add.graphics();
    grad.setScrollFactor(0);
    grad.setDepth(-200);
    var apply = function () {
      var cam = scene.cameras && scene.cameras.main;
      if (!cam) return;
      paintLevelGradient(grad, cam.width, cam.height, palette);
    };
    apply();
    if (scene.scale && typeof scene.scale.on === 'function') {
      scene.scale.on('resize', apply);
      scene.events.once('shutdown', function () {
        if (scene.scale && typeof scene.scale.off === 'function') scene.scale.off('resize', apply);
      });
    }
    ensureSceneCameraReady(scene);
  }

  function addStarsToRegistry(scene, delta, levelIndex) {
    if (!delta) return;
    var reg = scene.game && scene.game.registry;
    if (!reg) return;
    var cur = reg.get('starsTotal');
    if (cur == null) cur = 0;
    reg.set('starsTotal', cur + delta);
    var perLevel = reg.get('starsPerLevel') || {};
    perLevel[levelIndex] = (perLevel[levelIndex] || 0) + delta;
    reg.set('starsPerLevel', perLevel);
  }

  /* ============================================================
   * IntroPrologueScene — audio intro.mp3 (tira), 1ª partida nivel 1
   * ============================================================ */
  function IntroPrologueScene() {
    Phaser.Scene.call(this, { key: 'IntroPrologueScene' });
  }
  IntroPrologueScene.prototype = Object.create(Phaser.Scene.prototype);
  IntroPrologueScene.prototype.constructor = IntroPrologueScene;

  IntroPrologueScene.prototype.init = function (data) {
    this.levelIndex = data && data.levelIndex != null ? data.levelIndex : 0;
    this._introCanLeave = false;
    this._introLeaving = false;
  };

  /** Botón redondeado para prólogo (primario verde / secundario oscuro). */
  IntroPrologueScene.prototype.buildIntroChromeButton = function (cx, cy, label, opts) {
    var self = this;
    opts = opts || {};
    var variant = opts.variant || 'primary';
    var fs = opts.fontSize || (variant === 'secondary' ? 15 : 18);
    var family = opts.family || 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var padX = opts.paddingX != null ? opts.paddingX : variant === 'secondary' ? 22 : 28;
    var padY = opts.paddingY != null ? opts.paddingY : variant === 'secondary' ? 10 : 13;
    var topColor =
      opts.topColor != null
        ? opts.topColor
        : variant === 'secondary'
          ? 0x334155
          : 0x22c55e;
    var botColor =
      opts.botColor != null
        ? opts.botColor
        : variant === 'secondary'
          ? 0x1e293b
          : 0x15803d;
    var borderColor =
      opts.borderColor != null
        ? opts.borderColor
        : variant === 'secondary'
          ? 0xfef3c7
          : 0x064e2a;
    var depth = opts.depth || 25;
    var textColor = opts.textColor || (variant === 'secondary' ? '#fef3c7' : '#ffffff');
    var strokeColor = opts.strokeColor || (variant === 'secondary' ? '#0f172a' : '#052e16');

    var probe = this.add
      .text(0, 0, label, { fontFamily: family, fontSize: fs + 'px', fontStyle: 'bold' })
      .setVisible(false);
    var tw = probe.width;
    var th = probe.height;
    probe.destroy();

    var bw = Math.max(variant === 'secondary' ? 132 : 200, tw + padX * 2);
    var bh = th + padY * 2;
    var r = Math.min(bh / 2, variant === 'secondary' ? 22 : 28);

    var container = this.add.container(cx, cy).setDepth(depth).setScrollFactor(0);

    var shadow = this.add.graphics();
    shadow.fillStyle(0x000000, variant === 'secondary' ? 0.28 : 0.38);
    shadow.fillRoundedRect(-bw / 2 + 1, -bh / 2 + 5, bw, bh, r);
    container.add(shadow);

    var bg = this.add.graphics();
    if (variant === 'secondary') {
      bg.fillStyle(0x0f172a, 0.72);
      bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
    } else {
      bg.fillGradientStyle(topColor, topColor, botColor, botColor, 1, 1, 1, 1);
      bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
      bg.fillStyle(0xffffff, 0.2);
      bg.fillRoundedRect(-bw / 2 + 4, -bh / 2 + 3, bw - 8, bh * 0.4, { tl: r - 4, tr: r - 4, bl: 4, br: 4 });
    }
    bg.lineStyle(variant === 'secondary' ? 2 : 2, borderColor, variant === 'secondary' ? 0.75 : 0.9);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
    container.add(bg);

    var txt = this.add
      .text(0, 0, label, {
        fontFamily: family,
        fontSize: fs + 'px',
        color: textColor,
        fontStyle: 'bold',
        stroke: strokeColor,
        strokeThickness: variant === 'secondary' ? 3 : 4
      })
      .setOrigin(0.5);
    container.add(txt);

    var hit = this.add.zone(0, 0, bw, bh).setInteractive({ useHandCursor: true });
    container.add(hit);
    container.setData('hit', hit);
    container.setData('btnW', bw);
    container.setData('btnH', bh);

    var hoverTw = null;
    function isBtnAlive() {
      return container && container.active && container.scene === self && self.sys && self.sys.isActive();
    }
    var resetTw = function () {
      if (hoverTw) {
        try {
          if (hoverTw.stop) hoverTw.stop();
        } catch (eStop) {}
        hoverTw = null;
      }
      if (isBtnAlive() && self.tweens) self.tweens.killTweensOf(container);
    };
    hit.on('pointerover', function () {
      if (!isBtnAlive()) return;
      resetTw();
      container.setScale(1);
      hoverTw = self.tweens.add({
        targets: container,
        scale: 1.04,
        duration: 130,
        ease: 'Sine.easeOut'
      });
    });
    hit.on('pointerout', function () {
      if (!isBtnAlive()) return;
      resetTw();
      hoverTw = self.tweens.add({
        targets: container,
        scale: 1,
        duration: 130,
        ease: 'Sine.easeIn'
      });
    });
    hit.on('pointerdown', function () {
      if (!isBtnAlive()) return;
      self.tweens.add({
        targets: container,
        scale: 0.96,
        duration: 80,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
      if (opts.onClick) opts.onClick();
    });
    self.events.once('shutdown', function () {
      hit.removeAllListeners();
      resetTw();
    });

    return container;
  };

  IntroPrologueScene.prototype.setIntroButtonEnabled = function (btn, enabled) {
    if (!btn || !btn.active) return;
    var hit = btn.getData('hit');
    btn.setAlpha(enabled ? 1 : 0);
    btn.setScale(enabled ? 1 : 1);
    if (hit) {
      if (enabled) hit.setInteractive({ useHandCursor: true });
      else hit.disableInteractive();
    }
  };

  IntroPrologueScene.prototype.create = function () {
    var self = this;
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var cx = w / 2;
    var compact = w < 520 || h < 620;
    var serif = 'Georgia, "Times New Roman", "Liberation Serif", serif';
    var sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

    Transition.prepareSceneCamera(this);
    if (this.cameras && this.cameras.main) {
      try {
        this.cameras.main.resetFX();
        if (typeof this.cameras.main.setAlpha === 'function') this.cameras.main.setAlpha(1);
      } catch (eCam) {}
    }

    ensureBgMusic(this);
    duckBgMusicVolume(this, 0.06);

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    var palette = LEVEL_BG_GRADIENT[0];
    var grad = this.add.graphics().setScrollFactor(0).setDepth(-200);
    paintLevelGradient(grad, w, h, palette);

    var veil = this.add.graphics().setScrollFactor(0).setDepth(-100);
    veil.fillStyle(0x0f172a, 0.55);
    veil.fillRect(0, 0, w, h);

    var panelW = Math.min(w * 0.92, 480);
    var skipBtnH = compact ? 38 : 42;
    var footerGap = compact ? 16 : 22;
    var footerStack = footerGap + skipBtnH + (compact ? 10 : 14);
    var panelH = Math.min(h - footerStack - (compact ? 28 : 40), compact ? 400 : 468);
    panelH = Math.max(panelH, compact ? 320 : 360);
    var stackH = panelH + footerStack;
    var panelX = cx - panelW / 2;
    var panelY = Math.max(compact ? 12 : 18, (h - stackH) * 0.5);
    var panelBottom = panelY + panelH;
    var paper = this.add.graphics().setScrollFactor(0).setDepth(10);
    paper.fillStyle(0xfff6e3, 0.97);
    paper.fillRoundedRect(panelX, panelY, panelW, panelH, 18);
    paper.lineStyle(3, 0x8b5a2b, 1);
    paper.strokeRoundedRect(panelX, panelY, panelW, panelH, 18);

    var innerW = panelW - (compact ? 36 : 44);
    var tx = cx;

    this.add
      .text(tx, panelY + (compact ? 22 : 28), 'Prólogo', {
        fontFamily: serif,
        fontSize: (compact ? 24 : 28) + 'px',
        color: '#1a1208',
        fontStyle: 'bold',
        align: 'center',
        stroke: '#fef3c7',
        strokeThickness: 3
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.add
      .text(
        tx,
        panelY + (compact ? 54 : 64),
        'Basado en el episodio «Aquí no queremos moscas»\n(Inspector Gadget · serie original 1983–1986 · T1 ep. 43 · No Flies on Us).\n\nGadget viaja a Malasia en una misión que parece rutinaria; M.A.D. —la organización del Dr. Garra— suelta moscas robot con un virus del sueño. Penny y Sabiondo investigan en secreto mientras él se confunde con todo…',
        {
          fontFamily: serif,
          fontSize: (compact ? 12 : 13) + 'px',
          color: '#334155',
          align: 'center',
          wordWrap: { width: innerW },
          lineSpacing: 3
        }
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.add
      .text(tx, panelY + panelH * 0.58, 'Proyecto académico sin fines comerciales.\nNo afiliado a los titulares de la serie.', {
        fontFamily: sans,
        fontSize: (compact ? 10 : 11) + 'px',
        color: '#78716c',
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: innerW },
        lineSpacing: 2
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this._introStatus = this.add
      .text(tx, panelY + panelH * 0.68, 'Escucha el prólogo…', {
        fontFamily: sans,
        fontSize: (compact ? 13 : 14) + 'px',
        color: '#78350f',
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: innerW }
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(21);

    var barW = innerW * 0.85;
    var barX = cx - barW / 2;
    var barY = panelY + panelH * 0.76;
    var barH = 8;
    this._introBarBg = this.add.graphics().setScrollFactor(0).setDepth(21);
    this._introBarBg.fillStyle(0xd6d3d1, 1);
    this._introBarBg.fillRoundedRect(barX, barY, barW, barH, 4);
    this._introBarFill = this.add.graphics().setScrollFactor(0).setDepth(22);
    this._introBarW = barW;
    this._introBarX = barX;
    this._introBarY = barY;
    this._introBarH = barH;

    var ctaY = panelY + panelH - (compact ? 46 : 52);
    var divider = this.add.graphics().setScrollFactor(0).setDepth(19);
    divider.lineStyle(2, 0xca8a04, 0.88);
    divider.lineBetween(panelX + (compact ? 22 : 28), ctaY - (compact ? 22 : 26), panelX + panelW - (compact ? 22 : 28), ctaY - (compact ? 22 : 26));

    this._btnContinue = this.buildIntroChromeButton(cx, ctaY, 'Continuar al Bosque del Plano', {
      fontSize: compact ? 16 : 18,
      depth: 26,
      onClick: function () {
        if (!self._introCanLeave || self._introLeaving) return;
        self.leaveToPreLevel();
      }
    });
    this.setIntroButtonEnabled(this._btnContinue, false);

    var skipY = panelBottom + footerGap + skipBtnH * 0.5;
    this._btnSkip = this.buildIntroChromeButton(cx, skipY, 'Saltar audio', {
      variant: 'secondary',
      fontSize: compact ? 14 : 15,
      depth: 31
    });
    ButtonFx.bindAnimatedButton(
      this,
      this._btnSkip.getData('hit'),
      function () {
        self.skipIntroAudio();
      },
      { disableIdlePulse: true, disablePressPop: true, clickSound: 'menu' }
    );

    this.events.once('shutdown', function () {
      self.stopIntroVoice();
      restoreBgMusicVolume(self);
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });

    Transition.fadeIn(this, 320);
    this.beginIntroAudio();
  };

  IntroPrologueScene.prototype.drawIntroProgress = function (ratio) {
    if (!this._introBarFill) return;
    var r = Phaser.Math.Clamp(ratio, 0, 1);
    this._introBarFill.clear();
    this._introBarFill.fillStyle(0xca8a04, 1);
    this._introBarFill.fillRoundedRect(
      this._introBarX,
      this._introBarY,
      Math.max(4, this._introBarW * r),
      this._introBarH,
      4
    );
  };

  IntroPrologueScene.prototype.stopIntroVoice = function () {
    if (this._introVoice) {
      try {
        if (this._introVoice.isPlaying) this._introVoice.stop();
        this._introVoice.destroy();
      } catch (eV) {}
      this._introVoice = null;
    }
    if (this._introProgressTween) {
      try {
        this._introProgressTween.stop();
      } catch (eT) {}
      this._introProgressTween = null;
    }
  };

  IntroPrologueScene.prototype.onIntroAudioFinished = function () {
    if (this._introCanLeave) return;
    this._introCanLeave = true;
    this.drawIntroProgress(1);
    if (this._introStatus && this._introStatus.active) {
      this._introStatus.setText('Cuando quieras, continúa hacia la misión del Bosque.');
    }
    if (this._btnContinue && this._btnContinue.active) {
      this.setIntroButtonEnabled(this._btnContinue, true);
      try {
        Anim.animPop(this, this._btnContinue);
      } catch (eP) {}
    }
  };

  IntroPrologueScene.prototype.skipIntroAudio = function () {
    this.stopIntroVoice();
    this.onIntroAudioFinished();
    if (this._introStatus && this._introStatus.active) {
      this._introStatus.setText('Audio omitido. Pulsa continuar cuando estés listo.');
    }
  };

  IntroPrologueScene.prototype.beginIntroAudio = function () {
    var self = this;
    this.drawIntroProgress(0);
    var fallbackMs = 42000;

    var startProgressTween = function (durationMs) {
      var dur = Math.max(3000, durationMs || fallbackMs);
      if (self._introProgressTween) {
        try {
          self._introProgressTween.stop();
        } catch (e0) {}
      }
      self._introProgressTween = self.tweens.add({
        targets: { p: 0 },
        p: 1,
        duration: dur,
        ease: 'Linear',
        onUpdate: function (tw) {
          self.drawIntroProgress(tw.getValue());
        }
      });
    };

    if (this.sound && !this.sound.mute && this.cache && this.cache.audio && this.cache.audio.exists('intro')) {
      try {
        this.stopIntroVoice();
        this._introVoice = this.sound.add('intro', { volume: 0.92 });
        this._introVoice.once('complete', function () {
          self.onIntroAudioFinished();
        });
        this._introVoice.play();
        var poll = 0;
        var pollDur = function () {
          poll += 1;
          var sec =
            self._introVoice &&
            (self._introVoice.duration ||
              (self._introVoice.totalDuration != null ? self._introVoice.totalDuration : 0));
          if (sec && sec > 0.5) {
            startProgressTween(sec * 1000);
            return;
          }
          if (poll < 40) self.time.delayedCall(120, pollDur);
          else startProgressTween(fallbackMs);
        };
        pollDur();
        return;
      } catch (ePlay) {}
    }

    if (this._introStatus && this._introStatus.active) {
      this._introStatus.setText('No se pudo cargar el audio del prólogo.\nLee el texto y continúa.');
    }
    startProgressTween(10000);
    this.time.delayedCall(10000, function () {
      self.onIntroAudioFinished();
    });
  };

  IntroPrologueScene.prototype.leaveToPreLevel = function () {
    if (this._introLeaving) return;
    this._introLeaving = true;
    markComicIntroPlayed();
    this.stopIntroVoice();
    restoreBgMusicVolume(this);
    var idx = this.levelIndex != null ? this.levelIndex : 0;
    /* Sin fadeOut de cámara: deja PreLevel/Game en negro o solo degradado del body. */
    navigateFromEndScreen(this, 'PreLevelScene', { levelIndex: idx });
  };

  /* ============================================================
   * EpilogoContinuaraScene — «Continuará…»
   * ------------------------------------------------------------
   * Cierre de la Parte 1 (Bosque + Montañas): narración final
   * (continuara.mp3) con el mismo formato del prólogo y vuelta
   * al menú principal. Se llega desde la victoria de Las Montañas.
   * ============================================================ */
  function EpilogoContinuaraScene() {
    Phaser.Scene.call(this, { key: 'EpilogoContinuaraScene' });
  }
  EpilogoContinuaraScene.prototype = Object.create(Phaser.Scene.prototype);
  EpilogoContinuaraScene.prototype.constructor = EpilogoContinuaraScene;

  /* Botonera, barra de progreso y corte de voz idénticos al prólogo. */
  EpilogoContinuaraScene.prototype.buildIntroChromeButton =
    IntroPrologueScene.prototype.buildIntroChromeButton;
  EpilogoContinuaraScene.prototype.setIntroButtonEnabled =
    IntroPrologueScene.prototype.setIntroButtonEnabled;
  EpilogoContinuaraScene.prototype.drawIntroProgress =
    IntroPrologueScene.prototype.drawIntroProgress;
  EpilogoContinuaraScene.prototype.stopIntroVoice =
    IntroPrologueScene.prototype.stopIntroVoice;

  EpilogoContinuaraScene.prototype.init = function () {
    this._introCanLeave = false;
    this._introLeaving = false;
  };

  EpilogoContinuaraScene.prototype.create = function () {
    var self = this;
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var cx = w / 2;
    var compact = w < 520 || h < 620;
    var serif = 'Georgia, "Times New Roman", "Liberation Serif", serif';
    var sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

    destroyVictoryHtmlBar();
    Transition.prepareSceneCamera(this);
    if (this.cameras && this.cameras.main) {
      try {
        this.cameras.main.resetFX();
        if (typeof this.cameras.main.setAlpha === 'function') this.cameras.main.setAlpha(1);
      } catch (eCam) {}
    }

    ensureBgMusic(this);
    duckBgMusicVolume(this, 0.06);

    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    var palette = LEVEL_BG_GRADIENT[1] || LEVEL_BG_GRADIENT[0];
    var grad = this.add.graphics().setScrollFactor(0).setDepth(-200);
    paintLevelGradient(grad, w, h, palette);

    var veil = this.add.graphics().setScrollFactor(0).setDepth(-100);
    veil.fillStyle(0x0f172a, 0.55);
    veil.fillRect(0, 0, w, h);

    var panelW = Math.min(w * 0.92, 480);
    var skipBtnH = compact ? 38 : 42;
    var footerGap = compact ? 16 : 22;
    var footerStack = footerGap + skipBtnH + (compact ? 10 : 14);
    var panelH = Math.min(h - footerStack - (compact ? 28 : 40), compact ? 400 : 468);
    panelH = Math.max(panelH, compact ? 320 : 360);
    var stackH = panelH + footerStack;
    var panelX = cx - panelW / 2;
    var panelY = Math.max(compact ? 12 : 18, (h - stackH) * 0.5);
    var panelBottom = panelY + panelH;
    var paper = this.add.graphics().setScrollFactor(0).setDepth(10);
    paper.fillStyle(0xfff6e3, 0.97);
    paper.fillRoundedRect(panelX, panelY, panelW, panelH, 18);
    paper.lineStyle(3, 0x8b5a2b, 1);
    paper.strokeRoundedRect(panelX, panelY, panelW, panelH, 18);

    var innerW = panelW - (compact ? 36 : 44);
    var tx = cx;

    this.add
      .text(tx, panelY + (compact ? 22 : 28), 'Continuará…', {
        fontFamily: serif,
        fontSize: (compact ? 24 : 28) + 'px',
        color: '#1a1208',
        fontStyle: 'bold',
        align: 'center',
        stroke: '#fef3c7',
        strokeThickness: 3
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this.add
      .text(
        tx,
        panelY + (compact ? 54 : 64),
        'Con el sombrero de tío Gadget a salvo, Penny y Sabiondo miran hacia el este: el Secuaz confesó que la pista sigue en el desierto.\n\nM.A.D. y el Dr. Garra no descansan… pero Penny ya sabe leer el plano cartesiano como nadie.\n\nLa aventura seguirá en la próxima parte: El Desierto y El Océano.',
        {
          fontFamily: serif,
          fontSize: (compact ? 12 : 13) + 'px',
          color: '#334155',
          align: 'center',
          wordWrap: { width: innerW },
          lineSpacing: 3
        }
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(20);

    this._introStatus = this.add
      .text(tx, panelY + panelH * 0.68, 'Escucha el mensaje final…', {
        fontFamily: sans,
        fontSize: (compact ? 13 : 14) + 'px',
        color: '#78350f',
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: innerW }
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(21);

    var barW = innerW * 0.85;
    var barX = cx - barW / 2;
    var barY = panelY + panelH * 0.76;
    var barH = 8;
    this._introBarBg = this.add.graphics().setScrollFactor(0).setDepth(21);
    this._introBarBg.fillStyle(0xd6d3d1, 1);
    this._introBarBg.fillRoundedRect(barX, barY, barW, barH, 4);
    this._introBarFill = this.add.graphics().setScrollFactor(0).setDepth(22);
    this._introBarW = barW;
    this._introBarX = barX;
    this._introBarY = barY;
    this._introBarH = barH;

    var ctaY = panelY + panelH - (compact ? 46 : 52);
    var divider = this.add.graphics().setScrollFactor(0).setDepth(19);
    divider.lineStyle(2, 0xca8a04, 0.88);
    divider.lineBetween(panelX + (compact ? 22 : 28), ctaY - (compact ? 22 : 26), panelX + panelW - (compact ? 22 : 28), ctaY - (compact ? 22 : 26));

    this._btnContinue = this.buildIntroChromeButton(cx, ctaY, 'Volver al menú principal', {
      fontSize: compact ? 16 : 18,
      depth: 26,
      onClick: function () {
        if (!self._introCanLeave || self._introLeaving) return;
        self.leaveToMenu();
      }
    });
    this.setIntroButtonEnabled(this._btnContinue, false);

    var skipY = panelBottom + footerGap + skipBtnH * 0.5;
    this._btnSkip = this.buildIntroChromeButton(cx, skipY, 'Saltar audio', {
      variant: 'secondary',
      fontSize: compact ? 14 : 15,
      depth: 31
    });
    ButtonFx.bindAnimatedButton(
      this,
      this._btnSkip.getData('hit'),
      function () {
        self.skipEpilogoAudio();
      },
      { disableIdlePulse: true, disablePressPop: true, clickSound: 'menu' }
    );

    this.events.once('shutdown', function () {
      self.stopIntroVoice();
      restoreBgMusicVolume(self);
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });

    Transition.fadeIn(this, 320);
    this.beginEpilogoAudio();
  };

  EpilogoContinuaraScene.prototype.onEpilogoAudioFinished = function () {
    if (this._introCanLeave) return;
    this._introCanLeave = true;
    this.drawIntroProgress(1);
    if (this._introStatus && this._introStatus.active) {
      this._introStatus.setText('Fin de esta parte. ¡Gracias por jugar!');
    }
    if (this._btnContinue && this._btnContinue.active) {
      this.setIntroButtonEnabled(this._btnContinue, true);
      try {
        Anim.animPop(this, this._btnContinue);
      } catch (eP) {}
    }
  };

  EpilogoContinuaraScene.prototype.skipEpilogoAudio = function () {
    this.stopIntroVoice();
    this.onEpilogoAudioFinished();
    if (this._introStatus && this._introStatus.active) {
      this._introStatus.setText('Audio omitido. Vuelve al menú cuando estés listo.');
    }
  };

  EpilogoContinuaraScene.prototype.beginEpilogoAudio = function () {
    var self = this;
    this.drawIntroProgress(0);
    var fallbackMs = 42000;

    var startProgressTween = function (durationMs) {
      var dur = Math.max(3000, durationMs || fallbackMs);
      if (self._introProgressTween) {
        try {
          self._introProgressTween.stop();
        } catch (e0) {}
      }
      self._introProgressTween = self.tweens.add({
        targets: { p: 0 },
        p: 1,
        duration: dur,
        ease: 'Linear',
        onUpdate: function (tw) {
          self.drawIntroProgress(tw.getValue());
        }
      });
    };

    if (this.sound && !this.sound.mute && this.cache && this.cache.audio && this.cache.audio.exists('continuara')) {
      try {
        this.stopIntroVoice();
        this._introVoice = this.sound.add('continuara', { volume: 0.92 });
        this._introVoice.once('complete', function () {
          self.onEpilogoAudioFinished();
        });
        this._introVoice.play();
        var poll = 0;
        var pollDur = function () {
          poll += 1;
          var sec =
            self._introVoice &&
            (self._introVoice.duration ||
              (self._introVoice.totalDuration != null ? self._introVoice.totalDuration : 0));
          if (sec && sec > 0.5) {
            startProgressTween(sec * 1000);
            return;
          }
          if (poll < 40) self.time.delayedCall(120, pollDur);
          else startProgressTween(fallbackMs);
        };
        pollDur();
        return;
      } catch (ePlay) {}
    }

    if (this._introStatus && this._introStatus.active) {
      this._introStatus.setText('No se pudo cargar el audio final.\nLee el texto y vuelve al menú.');
    }
    startProgressTween(10000);
    this.time.delayedCall(10000, function () {
      self.onEpilogoAudioFinished();
    });
  };

  EpilogoContinuaraScene.prototype.leaveToMenu = function () {
    if (this._introLeaving) return;
    this._introLeaving = true;
    this.stopIntroVoice();
    restoreBgMusicVolume(this);
    navigateFromEndScreen(this, 'MainMenu');
  };

  /* ============================================================
   * PreLevelScene
   * ------------------------------------------------------------
   * Modal SOLO con narrativa + objetivos + botón "¡A jugar!".
   * Las preguntas se hacen DESPUÉS de encontrar el cofre, en
   * PostLevelScene.
   * ============================================================ */
  function PreLevelScene() {
    Phaser.Scene.call(this, { key: 'PreLevelScene' });
  }
  PreLevelScene.prototype = Object.create(Phaser.Scene.prototype);
  PreLevelScene.prototype.constructor = PreLevelScene;

  PreLevelScene.prototype.init = function (data) {
    var idx = 0;
    if (data && data.levelIndex != null) idx = data.levelIndex;
    else if (data && data.levelId != null) idx = data.levelId - 1;
    this.levelIndex = Phaser.Math.Clamp(idx, 0, levels.length - 1);
    this.level = levels[this.levelIndex];
  };

  /* Iconos decorativos por nivel (emoji grande en la cabecera del panel). */
  var LEVEL_ICONS = ['🌳', '🏔️', '🏜️', '🌊'];

  /* Layout responsive vertical para PreLevelScene.
     - Mide cada bloque para que nada se salga del panel.
     - Panel angosto (estilo móvil) centrado: max 440 px en escritorio, 94% en compact.
     - Cabecera oscura + cuerpo pergamino + botón grande abajo. */
  PreLevelScene.prototype.create = function () {
    var self = this;
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;

    destroyVictoryHtmlBar();
    Transition.prepareSceneCamera(this);
    if (this.cameras && this.cameras.main) {
      try {
        this.cameras.main.resetFX();
        if (typeof this.cameras.main.setAlpha === 'function') this.cameras.main.setAlpha(1);
      } catch (eCam) {}
    }
    paintLessonBackdrop(this);

    this.events.once('shutdown', function () {
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });

    var compact = w < 520 || h < 620;
    var serif = 'Georgia, "Times New Roman", "Liberation Serif", serif';
    var sans = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    var fsTitle = compact ? 22 : 26;
    var fsSubtitle = compact ? 12 : 13;
    var fsStory = compact ? 14 : 15;
    var fsSection = compact ? 13 : 14;
    var fsItem = compact ? 13 : 14;
    var fsBtn = compact ? 18 : 20;
    var iconSize = compact ? 36 : 44;

    var panelW = Math.min(w * 0.94, 460);
    var maxPanelH = h * 0.96;
    var padX = compact ? 18 : 22;
    var padTop = compact ? 14 : 16;
    var padBottom = compact ? 22 : 28;
    var innerW = panelW - padX * 2;

    /* === Medir contenido para calcular panelH dinámico === */
    var measure = function (txt, style) {
      var t = self.add.text(0, 0, txt, style).setVisible(false);
      var size = { w: t.width, h: t.height };
      t.destroy();
      return size;
    };
    var storyStyle = {
      fontFamily: serif,
      fontSize: fsStory + 'px',
      color: '#1f2937',
      align: 'left',
      wordWrap: { width: innerW },
      lineSpacing: 5
    };
    var itemStyle = {
      fontFamily: sans,
      fontSize: fsItem + 'px',
      color: '#1f2937',
      wordWrap: { width: innerW - 26 },
      lineSpacing: 3
    };
    var titleStyle = {
      fontFamily: serif,
      fontSize: fsTitle + 'px',
      color: '#fef3c7',
      fontStyle: 'bold',
      align: 'center',
      stroke: '#0b1f33',
      strokeThickness: 3
    };
    var subtitleStyle = {
      fontFamily: sans,
      fontSize: fsSubtitle + 'px',
      color: '#0b1f33',
      fontStyle: 'bold'
    };

    /* === Medir cabecera para que NO se solapen icono, título y pill === */
    var iconH = iconSize;
    var titleSize = measure(this.level.name, titleStyle);
    var subtitleSize = measure(this.level.description || '', subtitleStyle);
    var pillH = subtitleSize.h + 10;
    var pillW = subtitleSize.w + 22;
    var headerPadTop = 10;
    var headerGap1 = 2;
    var headerGap2 = 10;
    var headerPadBottom = 10;
    var headerH = headerPadTop + iconH + headerGap1 + titleSize.h + headerGap2 + pillH + headerPadBottom;

    /* === Medir contenido del cuerpo === */
    var storyH = measure(this.level.story || '', storyStyle).h;
    var objs = this.level.objetivos || [];
    var tareas = (this.level.tareas || []);
    var sectionGap = 14;
    var preButtonGap = compact ? 18 : 26;
    var itemGap = 8;
    var sectionTitleH = fsSection + 14;

    var measureObjsBlock = function () {
      if (!objs.length) return 0;
      var hh = sectionTitleH + 6;
      for (var io = 0; io < objs.length; io++) {
        hh += measure('★  ' + objs[io], itemStyle).h + itemGap;
      }
      return hh - itemGap;
    };
    var measureTareasBlock = function () {
      if (!tareas.length) return 0;
      var hh = sectionTitleH + 6;
      for (var it = 0; it < tareas.length; it++) {
        hh += measure((it + 1) + '. ' + (tareas[it].desc || ''), itemStyle).h + itemGap;
      }
      return hh - itemGap;
    };
    var objsBlockH = measureObjsBlock();
    var tareasBlockH = measureTareasBlock();

    var btnH = fsBtn * 1.4 + 28;
    var includeTareas = tareas.length > 0;

    var computeContentH = function () {
      return (
        headerH +
        padTop +
        storyH +
        sectionGap +
        objsBlockH +
        (includeTareas ? sectionGap + tareasBlockH : 0) +
        preButtonGap +
        btnH +
        padBottom
      );
    };

    var contentH = computeContentH();
    if (contentH > maxPanelH) {
      sectionGap = 10;
      itemGap = 6;
      preButtonGap = 14;
      objsBlockH = measureObjsBlock();
      tareasBlockH = measureTareasBlock();
      contentH = computeContentH();
    }
    if (contentH > maxPanelH && includeTareas) {
      includeTareas = false;
      contentH = computeContentH();
    }
    if (contentH > maxPanelH) {
      padTop = Math.max(8, padTop - 4);
      padBottom = Math.max(16, padBottom - 6);
      contentH = computeContentH();
    }
    var panelH = Math.min(maxPanelH, contentH);

    var panelX = w / 2 - panelW / 2;
    var panelY = h / 2 - panelH / 2;

    /* === Sombra del panel === */
    var shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillRoundedRect(panelX + 4, panelY + 8, panelW, panelH, 22);
    shadow.setDepth(8);

    /* === Cabecera oscura === */
    var header = this.add.graphics();
    header.fillStyle(0x1e3a5f, 1);
    header.fillRoundedRect(panelX, panelY, panelW, headerH, { tl: 22, tr: 22, bl: 0, br: 0 });
    header.lineStyle(2, 0xfacc15, 0.9);
    header.strokeRoundedRect(panelX, panelY, panelW, headerH, { tl: 22, tr: 22, bl: 0, br: 0 });
    header.setDepth(10);

    /* === Cuerpo pergamino === */
    var body = this.add.graphics();
    body.fillStyle(0xfff6e3, 0.985);
    body.fillRoundedRect(panelX, panelY + headerH, panelW, panelH - headerH, { tl: 0, tr: 0, bl: 22, br: 22 });
    body.lineStyle(2, 0xfacc15, 0.9);
    body.strokeRoundedRect(panelX, panelY, panelW, panelH, 22);
    body.setDepth(10);

    Transition.slideIn(this, 'down', shadow);
    Anim.animPop(this, header);

    /* === Contenido cabecera (apilado vertical sin solapamientos) === */
    var cx = panelX + panelW / 2;
    var hy = panelY + headerPadTop;
    var icon = LEVEL_ICONS[this.levelIndex] || '✨';
    this.add
      .text(cx, hy, icon, {
        fontFamily: sans,
        fontSize: iconSize + 'px',
        color: '#ffffff'
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
    hy += iconH + headerGap1;

    this.add
      .text(cx, hy, this.level.name, titleStyle)
      .setOrigin(0.5, 0)
      .setDepth(20);
    hy += titleSize.h + headerGap2;

    /* Subtítulo: pill dorada con la descripción del cuadrante. */
    var pill = this.add.graphics();
    pill.fillStyle(0xfacc15, 1);
    pill.fillRoundedRect(cx - pillW / 2, hy, pillW, pillH, pillH / 2);
    pill.lineStyle(1.5, 0xfff6e3, 0.85);
    pill.strokeRoundedRect(cx - pillW / 2, hy, pillW, pillH, pillH / 2);
    pill.setDepth(20);
    this.add
      .text(cx, hy + pillH / 2, this.level.description || '', subtitleStyle)
      .setOrigin(0.5)
      .setDepth(21);

    /* === Cuerpo === */
    var y = panelY + headerH + padTop;
    var leftX = panelX + padX;

    this.add
      .text(leftX, y, this.level.story || '', storyStyle)
      .setOrigin(0, 0)
      .setDepth(20);
    y += storyH + sectionGap;

    if (objs.length) {
      this.drawSectionTitle(leftX, y, innerW, 'Objetivos del nivel', '🎯', sans, fsSection);
      y += sectionTitleH + 6;
      for (var i = 0; i < objs.length; i++) {
        var line = this.add
          .text(leftX + 8, y, '★  ' + objs[i], itemStyle)
          .setOrigin(0, 0)
          .setDepth(20);
        y += line.height + itemGap;
      }
      y -= itemGap;
      y += sectionGap;
    }

    if (includeTareas) {
      this.drawSectionTitle(leftX, y, innerW, 'Tu plan en el mapa', '📋', sans, fsSection);
      y += sectionTitleH + 6;
      for (var j = 0; j < tareas.length; j++) {
        var lineT = this.add
          .text(leftX + 8, y, (j + 1) + '.  ' + (tareas[j].desc || ''), itemStyle)
          .setOrigin(0, 0)
          .setDepth(20);
        y += lineT.height + itemGap;
      }
      y -= itemGap;
    }

    /* === Botón "¡A jugar!" elegante === */
    var btnY = panelY + panelH - padBottom - btnH / 2;
    this.buildElegantButton(cx, btnY, '¡A jugar!', {
      fontSize: fsBtn,
      family: sans,
      paddingX: 32,
      paddingY: 14,
      topColor: 0x22c55e,
      botColor: 0x15803d,
      borderColor: 0x064e2a,
      depth: 22,
      onClick: function () {
        /* Arranca el capítulo: jingle de inicio (el sound manager es global,
           sigue sonando aunque la escena cambie). */
        try {
          if (self.sound && !self.sound.mute && self.cache.audio.exists('jingleInicio')) {
            self.sound.play('jingleInicio', { volume: 0.72 });
          }
        } catch (eJ) {}
        var idx = self.levelIndex;
        navigateFromEndScreen(self, 'GameScene', { levelIndex: idx });
      }
    });
  };

  /* Botón CTA con bordes muy redondeados, sombra suave, doble brillo y animación
     de hover/press. Devuelve el container para ajustes posteriores. */
  PreLevelScene.prototype.buildElegantButton = function (cx, cy, label, opts) {
    var self = this;
    opts = opts || {};
    var fs = opts.fontSize || 20;
    var family = opts.family || 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var padX = opts.paddingX != null ? opts.paddingX : 32;
    var padY = opts.paddingY != null ? opts.paddingY : 14;
    var topColor = opts.topColor != null ? opts.topColor : 0x22c55e;
    var botColor = opts.botColor != null ? opts.botColor : 0x15803d;
    var borderColor = opts.borderColor != null ? opts.borderColor : 0x064e2a;
    var depth = opts.depth || 22;

    /* Medimos el texto para dimensionar el botón. */
    var probe = this.add.text(0, 0, label, {
      fontFamily: family,
      fontSize: fs + 'px',
      fontStyle: 'bold'
    }).setVisible(false);
    var tw = probe.width;
    var th = probe.height;
    probe.destroy();

    var bw = Math.max(160, tw + padX * 2);
    var bh = th + padY * 2;
    var r = Math.min(bh / 2, 28);

    var container = this.add.container(cx, cy).setDepth(depth);

    /* Sombra suave. */
    var shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillRoundedRect(-bw / 2 + 2, -bh / 2 + 6, bw, bh, r);
    container.add(shadow);

    /* Fondo con gradiente vertical. */
    var bg = this.add.graphics();
    bg.fillGradientStyle(topColor, topColor, botColor, botColor, 1, 1, 1, 1);
    bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
    /* Highlight superior (brillo de cristal). */
    bg.fillStyle(0xffffff, 0.22);
    bg.fillRoundedRect(-bw / 2 + 4, -bh / 2 + 3, bw - 8, bh * 0.42, { tl: r - 4, tr: r - 4, bl: 4, br: 4 });
    /* Borde inferior oscuro fino. */
    bg.lineStyle(2, borderColor, 0.85);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, r);
    container.add(bg);

    var txt = this.add
      .text(0, 0, label, {
        fontFamily: family,
        fontSize: fs + 'px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#052e16',
        strokeThickness: 4
      })
      .setOrigin(0.5);
    container.add(txt);

    var hit = this.add.zone(0, 0, bw, bh).setInteractive({ useHandCursor: true });
    container.add(hit);

    var hoverTw = null;
    function isBtnAlive() {
      return (
        container &&
        container.active &&
        container.scene === self &&
        self.sys &&
        self.sys.isActive()
      );
    }
    var resetTw = function () {
      if (hoverTw) {
        try {
          if (hoverTw.stop) hoverTw.stop();
        } catch (eStop) {}
        hoverTw = null;
      }
      if (isBtnAlive() && self.tweens) self.tweens.killTweensOf(container);
    };
    hit.on('pointerover', function () {
      if (!isBtnAlive()) return;
      resetTw();
      container.setScale(1);
      hoverTw = self.tweens.add({
        targets: container,
        scale: 1.05,
        duration: 140,
        ease: 'Sine.easeOut'
      });
    });
    hit.on('pointerout', function () {
      if (!isBtnAlive()) return;
      resetTw();
      hoverTw = self.tweens.add({
        targets: container,
        scale: 1.0,
        duration: 140,
        ease: 'Sine.easeIn'
      });
    });
    hit.on('pointerdown', function () {
      if (!isBtnAlive()) return;
      self.tweens.add({
        targets: container,
        scale: 0.96,
        duration: 80,
        yoyo: true,
        ease: 'Sine.easeInOut'
      });
      if (opts.onClick) opts.onClick();
    });
    self.events.once('shutdown', function () {
      hit.removeAllListeners();
      resetTw();
    });

    return container;
  };

  /* Helper visual: barra-título de sección con pill azul + icono. */
  PreLevelScene.prototype.drawSectionTitle = function (x, y, innerW, label, icon, family, fontSize) {
    var probe = this.add.text(0, 0, icon + '  ' + label, {
      fontFamily: family,
      fontSize: fontSize + 'px',
      fontStyle: 'bold'
    }).setVisible(false);
    var tW = probe.width;
    var tH = probe.height;
    probe.destroy();
    var pillH = tH + 8;
    var pillW = tW + 22;
    var g = this.add.graphics();
    g.fillStyle(0x1e3a5f, 1);
    g.fillRoundedRect(x, y, pillW, pillH, pillH / 2);
    g.lineStyle(1.5, 0xfacc15, 0.85);
    g.strokeRoundedRect(x, y, pillW, pillH, pillH / 2);
    g.setDepth(20);
    this.add
      .text(x + pillW / 2, y + pillH / 2, icon + '  ' + label, {
        fontFamily: family,
        fontSize: fontSize + 'px',
        color: '#fef3c7',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setDepth(21);
  };

  /* ============================================================
   * PostLevelScene
   * ------------------------------------------------------------
   * Aparece tras encontrar el cofre. Plantea las preguntas del
   * nivel, suma estrellas y al terminar lanza VictoryScene.
   * ============================================================ */
  function PostLevelScene() {
    Phaser.Scene.call(this, { key: 'PostLevelScene' });
  }
  PostLevelScene.prototype = Object.create(Phaser.Scene.prototype);
  PostLevelScene.prototype.constructor = PostLevelScene;

  PostLevelScene.prototype.init = function (data) {
    var idx = 0;
    if (data && data.levelIndex != null) idx = data.levelIndex;
    else if (data && data.levelId != null) idx = data.levelId - 1;
    this.levelIndex = Phaser.Math.Clamp(idx, 0, levels.length - 1);
    this.level = levels[this.levelIndex];
    this.preguntas = (this.level && this.level.preguntas) || [];
    this.pregIdx = 0;
    this.hintUsed = false;
    this.earnedHere = 0;
  };

  PostLevelScene.prototype.create = function () {
    var self = this;
    paintLessonBackdrop(this);
    buildLessonPanel(this);

    this.events.once('shutdown', function () {
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });

    if (!this.preguntas.length) {
      this.gotoVictory();
      return;
    }
    this.showPregunta();
  };

  PostLevelScene.prototype.clearContent = function () {
    if (this.content) this.content.removeAll(true);
  };

  PostLevelScene.prototype.showPregunta = function () {
    var self = this;
    this.clearContent();
    this.hintUsed = false;

    var p = this.preguntas[this.pregIdx];
    var padX = 26;
    var innerW = this.panelW - padX * 2;
    var cx = this.panelX + this.panelW / 2;
    var top = this.panelY + 22;

    addLessonText(this, cx, top, 'Repaso ' + (this.pregIdx + 1) + ' de ' + this.preguntas.length, {
      fontFamily: 'system-ui, Arial, sans-serif',
      fontSize: '14px',
      color: '#7c2d12',
      fontStyle: 'bold'
    }, 0.5, 0);

    addLessonText(this, cx, top + 26, this.level.name + ' · ¡Lo lograste!', {
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
      color: '#15803d',
      fontStyle: 'bold'
    }, 0.5, 0);

    addLessonText(this, this.panelX + padX, top + 64, p.texto, {
      fontFamily: 'Georgia, serif',
      fontSize: '17px',
      color: '#1f2937',
      align: 'left',
      wordWrap: { width: innerW },
      lineSpacing: 6
    }, 0, 0);

    var hintLabel = addLessonText(this, this.panelX + padX, top + 156, '', {
      fontFamily: 'system-ui, Arial, sans-serif',
      fontSize: '13px',
      color: '#b45309',
      fontStyle: 'italic',
      wordWrap: { width: innerW }
    }, 0, 0);

    var optTop = top + 196;
    var optGap = 50;
    p.opciones.forEach(function (op, i) {
      var btn = self.add
        .text(cx, optTop + i * optGap, op, {
          fontFamily: 'system-ui, Arial, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
          fontStyle: 'bold',
          backgroundColor: '#1e40af',
          padding: { x: 18, y: 10 },
          fixedWidth: Math.min(360, innerW),
          align: 'center'
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      ButtonFx.bindAnimatedButton(self, btn, function () {
        self.onResponderPregunta(i, btn, hintLabel);
      });
      self.content.add(btn);
    });
  };

  PostLevelScene.prototype.onResponderPregunta = function (i, btn, hintLabel) {
    var self = this;
    var p = this.preguntas[this.pregIdx];
    var rules = window.SCORE_RULES || {};
    if (i === p.correcta) {
      btn.setBackgroundColor('#16a34a');
      var gain = this.hintUsed
        ? rules.preguntaCorrectaConPista != null ? rules.preguntaCorrectaConPista : 5
        : rules.preguntaCorrectaPrimera != null ? rules.preguntaCorrectaPrimera : 10;
      this.earnedHere += gain;
      addLessonText(this, this.panelX + this.panelW / 2, this.panelY + this.panelH - 60,
        '¡Correcto!  +' + gain + ' ⭐', {
          fontFamily: 'system-ui, Arial, sans-serif',
          fontSize: '16px',
          color: '#15803d',
          fontStyle: 'bold'
        }, 0.5, 0);
      this.time.delayedCall(700, function () {
        self.pregIdx++;
        if (self.pregIdx < self.preguntas.length) {
          self.showPregunta();
        } else {
          addStarsToRegistry(self, self.earnedHere, self.levelIndex);
          var totalAhora = self.registry.get('starsTotal');
          if (totalAhora == null) totalAhora = 0;
          var lastEarn = self.registry.get('lastGameEarned');
          if (lastEarn == null) lastEarn = 0;
          self.registry.set('lastGameEarned', lastEarn + self.earnedHere);
          self.gotoVictory();
        }
      });
    } else {
      btn.setBackgroundColor('#b91c1c');
      this.hintUsed = true;
      if (hintLabel && hintLabel.active) {
        hintLabel.setText('Pista: ' + (p.pista || 'Inténtalo de nuevo.'));
      }
      this.time.delayedCall(450, function () {
        if (btn && btn.active) btn.setBackgroundColor('#1e40af');
      });
    }
  };

  PostLevelScene.prototype.gotoVictory = function () {
    var self = this;
    var gameRef = this.game;
    Transition.fadeOut(this, function () {
      if (!gameRef || !gameRef.scene) return;
      /* Sin esto, VictoryScene leía lastCompletedLevel viejo o vacío → botones “mal”. */
      gameRef.registry.set('lastCompletedLevel', self.level);
      gameRef.registry.set('lastVictoryLevelIndex', self.levelIndex);
      gameRef.scene.start('VictoryScene');
    }, 260);
  };

  function GameScene() {
    Phaser.Scene.call(this, { key: 'GameScene' });
  }
  GameScene.prototype = Object.create(Phaser.Scene.prototype);
  GameScene.prototype.constructor = GameScene;

  GameScene.prototype.init = function (data) {
    var idx = 0;
    if (data && data.levelIndex != null) idx = data.levelIndex;
    else if (data && data.levelId != null) idx = data.levelId - 1;
    this.levelIndex = Phaser.Math.Clamp(idx, 0, levels.length - 1);
    /* Referencias de HUD de una partida anterior (escena reiniciada, objetos destruidos). */
    this.__coordHudText = null;
    this.__msgText = null;
    this.__msgHideTimer = null;
    this.__starsHud = null;
    this.__helpOpen = false;
    this._sombreroDestMarker = null;
    this._questionAxisGuidesGfx = null;
    this._missionAxisGuidesGfx = null;
    this._secuazFogCluster = null;
    this._secuazFogDispelled = false;
    this._magiaSecuazCinematicRunning = false;
    this._taskActionsRunning = false;
    this._taskMetaLatchIndex = -1;
    /* Evita maybePrompt / tryRecover reabriendo el mismo aviso entre closeTaskModal y advanceTaskAfterComplete. */
    this._taskNoticeAdvanceScheduled = false;
    this._taskChainingModal = false;
    this._taskChainingSince = 0;
  };

  GameScene.prototype.cartCellCenterWorld = function (cx, cy) {
    var p = this.gridToWorldCart(cx, cy);
    return {
      x: p.x + this.cellSize * 0.5,
      y: p.y - this.cellSize * 0.5
    };
  };

  GameScene.prototype.clearSecuazFog = function () {
    var cluster = this._secuazFogCluster;
    var self = this;
    if (cluster) {
      if (cluster.puffs && this.tweens) {
        cluster.puffs.forEach(function (p) {
          if (p && p.active) self.tweens.killTweensOf(p);
        });
      }
      if (cluster.container && cluster.container.destroy) {
        try {
          cluster.container.destroy(true);
        } catch (eCf) {}
      }
    }
    this._secuazFogCluster = null;
    try {
      Particles.purgeSecuazFogSprites(this);
    } catch (ePurge) {}
  };

  GameScene.prototype.forceDispelSecuazFog = function () {
    this._secuazFogDispelled = true;
    this.clearSecuazFog();
  };

  GameScene.prototype.syncSecuazFog = function () {
    try {
      if (!this.level || this.level.id !== 2) {
        this.clearSecuazFog();
        return;
      }
      /* Persecución del Secuaz: niebla activa en índices 8–13 (incl. diálogo previo a la magia). */
      if (this._secuazFogDispelled || this._taskIndex < 8 || this._taskIndex >= 14) {
        if (this._taskIndex >= 14) this._secuazFogDispelled = true;
        this.clearSecuazFog();
        return;
      }
      /* Niebla activa solo en esa fase. */
      if (
        this._secuazFogCluster &&
        this._secuazFogCluster.container &&
        this._secuazFogCluster.container.active
      ) {
        return;
      }
      var self = this;
      this._secuazFogCluster = Particles.createSecuazFogCluster(
        this,
        function (x, y) {
          return self.cartCellCenterWorld(x, y);
        },
        [
          { x: -7, y: 5 },
          { x: -7, y: 4 },
          { x: -7, y: 6 },
          { x: -6, y: 7 },
          { x: -6, y: 5 },
          { x: -5, y: 6 },
          { x: -5, y: 4 }
        ],
        this.cellSize
      );
    } catch (eFog) {
      console.warn('[Caza Tesoro] syncSecuazFog:', eFog);
      this.clearSecuazFog();
    }
  };

  GameScene.prototype.startSecuazFogDispel = function (opts) {
    opts = opts || {};
    if (this._secuazFogDispelled) {
      this.clearSecuazFog();
      return;
    }
    var cluster = this._secuazFogCluster;
    if (!cluster || !cluster.puffs || !cluster.puffs.length) {
      this.forceDispelSecuazFog();
      return;
    }
    if (opts && opts.instant) {
      this.forceDispelSecuazFog();
      return;
    }
    this._secuazFogDispelled = true;
    this._secuazFogCluster = null;
    var self = this;
    Particles.dispelSecuazFog(
      this,
      cluster.puffs,
      function () {
        if (cluster.container && cluster.container.destroy) {
          try {
            cluster.container.destroy();
          } catch (eFc) {}
        }
        try {
          Particles.purgeSecuazFogSprites(self);
        } catch (eP2) {}
      },
      { lento: !!opts.lento }
    );
  };

  GameScene.prototype.ensurePlaneMetrics = function () {
    if (!this._plane) {
      this._plane = Logic.getPlaneMetrics(this.level);
    }
    return this._plane;
  };

  GameScene.prototype.cartToGrid = function (cx, cy) {
    return Logic.cartToGrid(this.level, cx, cy);
  };

  /** Posición en pantalla del vértice (esquina inf.-izq.) de la casilla cartesiana (gx, gy). */
  GameScene.prototype.gridToWorld = function (gx, gy) {
    var alto = this.ensurePlaneMetrics().alto;
    return {
      x: this.gridOriginX + gx * this.cellSize,
      y: this.gridOriginY + (alto - gy) * this.cellSize
    };
  };

  GameScene.prototype.gridToWorldCart = function (cx, cy) {
    var g = this.cartToGrid(cx, cy);
    return this.gridToWorld(g.gx, g.gy);
  };

  /** Pies de NPC/objeto ilustrado: borde sur de la casilla, centrado en x. */
  GameScene.prototype.npcFeetAnchor = function (cx, cy) {
    var p = this.gridToWorldCart(cx, cy);
    return {
      x: p.x + this.cellSize * 0.5,
      y: p.y
    };
  };

  /** Ancla en pantalla para dibujar un NPC (alineado a la columna cartesiana x). */
  GameScene.prototype.npcDisplayAnchor = function (cx, cy, tipo) {
    var feet = this.npcFeetAnchor(cx, cy);
    if (tipo === 'sirVectorius') {
      return {
        x: this.cartXToScreenX(cx) + this.cellSize * 0.5 + this.cellSize * SIR_VECTORIUS_NUDGE_X,
        y: feet.y + this.cellSize * SIR_VECTORIUS_NUDGE_Y
      };
    }
    if (tipo === 'sombrero') {
      return {
        x: this.cartXToScreenX(cx) + this.cellSize * 0.5 + this.cellSize * SOMBRERO_NUDGE_X,
        y: feet.y + this.cellSize * SOMBRERO_NUDGE_Y
      };
    }
    if (tipo === 'sultanRastreo') {
      return {
        x: this.cartXToScreenX(cx) + this.cellSize * 0.5 + this.cellSize * SULTAN_RASTREO_NUDGE_X,
        y: feet.y + this.cellSize * SULTAN_RASTREO_NUDGE_Y
      };
    }
    return feet;
  };

  GameScene.prototype.findObstacleSpriteAt = function (gx, gy, tipo) {
    var list = this.obstacleSprites || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || !s.active) continue;
      if (s.getData('gx') === gx && s.getData('gy') === gy && s.getData('tipo') === tipo) {
        return s;
      }
    }
    return null;
  };

  GameScene.prototype.scaleSultanRastreoSprite = function (spr, texKey) {
    if (!spr || !texKey || !this.textures.exists(texKey)) return;
    spr.setTexture(texKey);
    spr.setOrigin(0.5, 0.9);
    var suBox = this.cellSize * SULTAN_RASTREO_DISPLAY_BOX;
    spr.setScale(Math.min(suBox / spr.width, suBox / spr.height, 2.45));
  };

  /** Transición suave sultan2 → sultan3 (p. ej. al girar hacia el oeste). */
  GameScene.prototype.crossfadeObstacleSprite = function (spr, texKey, opts) {
    if (!spr || !spr.active || !this.textures.exists(texKey)) return;
    var self = this;
    var duration = (opts && opts.duration) || 480;
    if (this.tweens) this.tweens.killTweensOf(spr);
    spr.setAlpha(1);
    this.tweens.add({
      targets: spr,
      alpha: 0,
      duration: Math.floor(duration * 0.45),
      ease: 'Sine.easeIn',
      onComplete: function () {
        self.scaleSultanRastreoSprite(spr, texKey);
        spr.setAngle(0);
        self.tweens.add({
          targets: spr,
          alpha: 1,
          duration: Math.floor(duration * 0.55),
          ease: 'Sine.easeOut'
        });
      }
    });
  };

  GameScene.prototype.runAvisoSpriteChange = function (spec, task) {
    if (!spec) return;
    var meta = (task && task.meta) || {};
    var gx = spec.x != null ? spec.x : meta.x;
    var gy = spec.y != null ? spec.y : meta.y;
    var tipo = spec.tipoObjeto || 'sultanRastreo';
    var spr = this.findObstacleSpriteAt(gx, gy, tipo);
    if (!spr) return;
    var texKey = spec.textura || 'sultan3';
    this.crossfadeObstacleSprite(spr, texKey, { duration: spec.duracion });
  };

  /** Posición horizontal en pantalla de la línea vertical del eje cartesiano x = cx. */
  GameScene.prototype.cartXToScreenX = function (cx) {
    var plane = this.ensurePlaneMetrics();
    return this.gridOriginX + (cx - plane.xMin) * this.cellSize;
  };

  /** Convierte un toque/clic en pantalla a coordenada cartesiana del mapa (o null si fue fuera). */
  GameScene.prototype.pointerToCart = function (wx, wy) {
    if (this.gridOriginX == null || this.cellSize == null || !this.level) return null;
    var plane = this.ensurePlaneMetrics();
    var relX = wx - this.gridOriginX;
    var relY = wy - this.gridOriginY;
    var maxW = this.cellSize * plane.ancho;
    var maxH = this.cellSize * plane.alto;
    if (relX < 0 || relY < 0 || relX >= maxW || relY >= maxH) return null;
    var gx = Math.floor(relX / this.cellSize);
    var gyScreen = Math.floor(relY / this.cellSize);
    var gy = plane.alto - 1 - gyScreen;
    if (gy < 0 || gy >= plane.alto) return null;
    return Logic.gridToCart(this.level, gx, gy);
  };

  /** Celular: un toque en la casilla vecina mueve a Penny (mismo paso que una flecha). */
  GameScene.prototype.tryMoveToCartCell = function (tx, ty) {
    if (this._moving || this._ending || this._taskModalActive || this.__helpOpen) return;
    var dx = tx - this.pos.x;
    var dy = ty - this.pos.y;
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    var dir =
      dy === 1 ? 'arriba' : dy === -1 ? 'abajo' : dx === 1 ? 'derecha' : 'izquierda';
    this.tryMove(dir);
  };

  GameScene.prototype.handleGridTap = function (wx, wy) {
    this.tickTaskModalRecovery();
    if (this._taskModalActive) return;
    var target = this.pointerToCart(wx, wy);
    if (!target) return;
    this.tryMoveToCartCell(target.x, target.y);
  };

  GameScene.prototype.installGridTouchControls = function () {
    var self = this;
    if (this._gridTouchZone) {
      this._gridTouchZone.destroy();
      this._gridTouchZone = null;
    }
    var pa = this.__playArea;
    if (!pa || !this.input) return;
    var zone = this.add.zone(pa.x + pa.w / 2, pa.y + pa.h / 2, pa.w, pa.h);
    zone.setDepth(3.2);
    zone.setInteractive();
    zone.on('pointerdown', function (pointer) {
      if (pointer && pointer.event && pointer.event.target) {
        /* Evita doble disparo si el navegador emite touch + mouse. */
        pointer.event.preventDefault();
      }
      self.handleGridTap(pointer.worldX, pointer.worldY);
    });
    this._gridTouchZone = zone;
  };

  /* === Sistema de tareas (preguntas integradas al mapa) === */

  GameScene.prototype.hasTareas = function () {
    return !!(this.level && this.level.tareas && this.level.tareas.length);
  };

  GameScene.prototype.getCurrentTask = function () {
    if (!this.hasTareas()) return null;
    return this.level.tareas[this._taskIndex] || null;
  };

  GameScene.prototype.forceReleaseTaskModal = function () {
    this._taskModalActive = false;
    this._taskModalRefs = null;
    this._taskMetaLatchIndex = -1;
    this._taskNoticeAdvanceScheduled = false;
    this._taskChainingModal = false;
    this._taskChainingSince = 0;
    this.clearQuestionAxisGuides();
    this.setPlayDialogDockVisible(true);
    this.updatePlayDialogDock();
    if (this._taskListBg && this._taskListWasCollapsed === false) {
      this.setTaskListCollapsed(false);
    }
    this._taskListWasCollapsed = null;
    this._taskListPendingRestore = false;
  };

  /** Si el modal quedó “fantasma” (_taskModalActive sin ventana), libera el control. */
  GameScene.prototype.reconcileTaskModalState = function () {
    if (this._taskChainingModal && this._taskChainingSince > 0 && this.time) {
      if (this.time.now - this._taskChainingSince > 600) {
        this._taskChainingModal = false;
        this._taskChainingSince = 0;
      }
    }
    if (!this._taskModalActive) return;
    var refs = this._taskModalRefs;
    var modal = refs && refs.modal;
    var alive =
      modal &&
      modal.active &&
      (typeof modal.visible !== 'boolean' || modal.visible);
    if (!alive) {
      this.forceReleaseTaskModal();
    }
  };

  GameScene.prototype.promptCurrentTaskArrival = function (task) {
    if (!task) return;
    this.reconcileTaskModalState();
    if (this._taskModalActive) return;
    if (task.aviso) this.showTaskNotice(task);
    else if (task.pregunta) this.showTaskQuestion(task);
    else this.showTaskNotice(task);
  };

  /** Reabre el diálogo si la meta ya se activó pero la ventana no llegó a mostrarse. */
  GameScene.prototype.tryRecoverStuckTaskAtMeta = function () {
    if (this._taskChainingModal) return false;
    if (this._taskNoticeAdvanceScheduled) return false;
    this.reconcileTaskModalState();
    if (!this.hasTareas() || this._taskModalActive || this._ending) return false;
    var task = this.getCurrentTask();
    if (!task || !task.meta || !this.isMetaSatisfied(task.meta, this.pos)) return false;
    if (this._taskMetaLatchIndex !== this._taskIndex) return false;
    this._taskMetaLatchIndex = -1;
    this.promptCurrentTaskArrival(task);
    return true;
  };

  /** Si la nueva tarea ya se cumple en la casilla actual (sin moverse), abre el diálogo. */
  GameScene.prototype.maybePromptTaskAtCurrentPosition = function () {
    if (this._taskChainingModal) return;
    if (this._taskNoticeAdvanceScheduled) return;
    this.reconcileTaskModalState();
    if (!this.hasTareas() || this._taskModalActive || this._ending || this._moving) return;
    var task = this.getCurrentTask();
    if (!task || !task.meta || !this.isMetaSatisfied(task.meta, this.pos)) return;
    if (this._taskMetaLatchIndex === this._taskIndex) return;
    this.promptCurrentTaskArrival(task);
  };

  /** ¿Abrir la tarea encadenada al instante (misma casilla / vecino), sin esperar movimiento? */
  GameScene.prototype.shouldAutoOpenChainedTask = function (nextTask) {
    if (!nextTask) return false;
    if (!nextTask.aviso && !nextTask.pregunta) return false;
    if (!nextTask.meta) return true;
    return this.isMetaSatisfied(nextTask.meta, this.pos);
  };

  GameScene.prototype.openChainedTaskModal = function (nextTask) {
    if (!nextTask) return;
    if (nextTask.aviso) this.showTaskNotice(nextTask);
    else if (nextTask.pregunta) this.showTaskQuestion(nextTask);
  };

  /**
   * Avanza el índice de misión tras cerrar aviso o responder bien.
   * @param {{ chainNext?: boolean, nextTask?: object, delayMs?: number, completedTask?: object }} opts
   */
  GameScene.prototype.advanceTaskAfterComplete = function (opts) {
    opts = opts || {};
    var self = this;
    var prevTask = opts.completedTask || null;
    /* Evita doble incremento si bumpTaskAndComplete / runTaskActions se dispara dos veces
       (síntoma: misión pasa de Sir/magia al cofre sin pasar por (0, 3)). */
    if (this.level && Array.isArray(this.level.tareas) && prevTask) {
      var ci = this.level.tareas.indexOf(prevTask);
      if (ci !== -1 && ci !== this._taskIndex) {
        this._taskNoticeAdvanceScheduled = false;
        return;
      }
    }
    this._taskNoticeAdvanceScheduled = false;
    this._taskIndex += 1;
    MissionFlow.missionRuntimeOnTaskAdvanced(this);
    this._taskMetaLatchIndex = -1;
    this.renderTaskList();
    this.showMetaMarker();

    var nextTask = opts.nextTask || this.getCurrentTask();
    if (opts.chainNext && nextTask && this.shouldAutoOpenChainedTask(nextTask)) {
      this._taskChainingModal = true;
      this._taskChainingSince = this.time ? this.time.now : 0;
      this.time.delayedCall(opts.delayMs != null ? opts.delayMs : 220, function () {
        if (!self.sys || !self.sys.isActive()) return;
        self._taskChainingModal = false;
        self._taskChainingSince = 0;
        self.openChainedTaskModal(nextTask);
      });
      return;
    }

    /* Con todas las misiones hechas ya no hay texto útil en el dock (evita
       «sigue al cofre» tras reclamar el cofre); la victoria viene enseguida. */
    if (!this.allMissionTasksOnComplete()) {
      this.setPlayDialogDockVisible(true);
      this.updatePlayDialogDock();
    } else {
      this.setPlayDialogDockVisible(false);
    }

    if (!this.allMissionTasksOnComplete()) {
      this.maybePromptTaskAtCurrentPosition();
    }
    if (prevTask && prevTask.meta && prevTask.meta.tipo === 'cofre') {
      this.clearMetaMarker();
      this.scheduleVictoria();
    }
  };

  GameScene.prototype.tickTaskModalRecovery = function () {
    MissionFlow.missionRuntimeTick(this);
    this.reconcileTaskModalState();
    if (this.tryRecoverStuckTaskAtMeta()) return;
    this.maybePromptTaskAtCurrentPosition();
  };

  GameScene.prototype.allTareasDone = function () {
    if (!this.hasTareas()) return true;
    return this._taskIndex >= this.level.tareas.length;
  };

  /** Solo niveles con tareas: índice pasó la última misión (victoria / fin de cadena). */
  GameScene.prototype.allMissionTasksOnComplete = function () {
    return !!(this.hasTareas() && this.level.tareas && this._taskIndex >= this.level.tareas.length);
  };

  GameScene.prototype.isMetaSatisfied = function (meta, pos) {
    if (!meta) return false;
    switch (meta.tipo) {
      case 'cofre': {
        var t = this.level.tesoro;
        return pos.x === t.x && pos.y === t.y;
      }
      case 'casilla':
        return pos.x === meta.x && pos.y === meta.y;
      case 'vecino': {
        var dx = Math.abs(pos.x - meta.x);
        var dy = Math.abs(pos.y - meta.y);
        return Math.max(dx, dy) <= 1;
      }
      case 'eje':
        if (meta.eje === 'x') return pos.y === 0;
        if (meta.eje === 'y') return pos.x === 0;
        return false;
      case 'rectaX':
        return meta.x != null && pos.x === meta.x;
      default:
        return false;
    }
  };

  /** Borde derecho reservado para el HUD «Posición / movimientos» (no solapar ejes ni ⭐). */
  GameScene.prototype.getYAxisLabelClearanceX = function (tickFontPx) {
    var plane = this.ensurePlaneMetrics();
    var gx = this.gridOriginX != null ? this.gridOriginX : 0;
    /* Montañas (x negativa): HUD en el costado izquierdo; el eje y está en x = 0. */
    if (plane.xMin < 0) {
      return gx + 8;
    }
    var tick =
      tickFontPx != null
        ? tickFontPx
        : Math.max(11, Math.min(18, Math.floor((this.cellSize || 40) * 0.34)));
    var worst = '';
    for (var ly = plane.yMin; ly <= plane.yMax; ly++) {
      var s = formatAxisTickLabel(ly);
      if (s.length > worst.length) worst = s;
    }
    var charW = Math.max(7, Math.floor(tick * 0.58));
    var yInset = Math.max(5, Math.floor((this.cellSize || 40) * 0.14));
    var yAxisVx = this.cartXToScreenX(0);
    var labelAnchorX = yAxisVx - yInset;
    return Math.max(gx + 8, labelAnchorX - worst.length * charW);
  };

  GameScene.prototype.getCoordHudLayout = function (opts) {
    opts = opts || {};
    var w = this.cameras.main.width;
    var isPortrait = this.cameras.main.height > w;
    var plane = this.ensurePlaneMetrics();
    var gx = this.gridOriginX != null ? this.gridOriginX : 0;
    var cs = this.cellSize || 40;
    var helpCx = opts.helpCx != null ? opts.helpCx : w - 32;
    var helpBtnR = opts.helpBtnR != null ? opts.helpBtnR : 22;
    var westMap = plane.xMin < 0;
    var hudX;
    var coordMaxW;

    if (westMap) {
      var yAxisX =
        this.__yAxisScreenX != null ? this.__yAxisScreenX : this.cartXToScreenX(0);
      hudX = gx + 6;
      coordMaxW = Math.max(92, Math.min(138, Math.floor(yAxisX - hudX - 14)));
      if (isPortrait) {
        coordMaxW = Math.min(coordMaxW, Math.max(92, helpCx - helpBtnR * 2 - hudX - 16));
      }
    } else {
      var clearX = this.getYAxisLabelClearanceX(opts.tickFont);
      hudX = isPortrait ? clearX : Math.max(gx + 10, clearX);
      coordMaxW = isPortrait
        ? Math.max(72, helpCx - helpBtnR * 2 - hudX - 10)
        : Math.max(72, helpCx - helpBtnR * 2 - 14 - hudX);
    }

    return {
      hudX: hudX,
      coordMaxW: coordMaxW,
      westMap: westMap,
      isPortrait: isPortrait
    };
  };

  GameScene.prototype.syncHudCoordLayout = function (opts) {
    var w = this.cameras.main.width;
    var isPortrait = this.cameras.main.height > w;
    var helpCx = opts && opts.helpCx != null ? opts.helpCx : w - 32;
    var helpBtnR = opts && opts.helpBtnR != null ? opts.helpBtnR : 22;
    var tickFont =
      opts && opts.tickFont != null
        ? opts.tickFont
        : Math.max(11, Math.min(18, Math.floor((this.cellSize || 40) * 0.34)));
    var coordLayout = this.getCoordHudLayout({
      helpCx: helpCx,
      helpBtnR: helpBtnR,
      tickFont: tickFont
    });
    this.__hudCoordX = coordLayout.hudX;
    this.__hudWestColumn = coordLayout.westMap;
    this.__yAxisLabelClearanceX = this.getYAxisLabelClearanceX(tickFont);
    this.__hudCoordWrapW = coordLayout.coordMaxW;
    if (this.__coordHudText && this.__coordHudText.active) {
      this.__coordHudText.setPosition(
        coordLayout.hudX,
        this.__hudCoordY != null ? this.__hudCoordY : 6
      );
      if (coordLayout.coordMaxW > 0) {
        this.__coordHudText.setStyle({ wordWrap: { width: coordLayout.coordMaxW } });
      }
    }
  };

  /** Zona izquierda libre para «Posición: (x, y)»; panel de misión a la derecha. */
  GameScene.prototype.computeTaskListHudLayout = function () {
    var w = this.cameras.main.width;
    var isCompact = w < 520 || this.cameras.main.height < 560;
    var isPortraitHud = this.cameras.main.height > w;
    var gridW = this.cellSize * (this.level.anchoMapa || this._plane.ancho);
    var coordW = this.__hudCoordWrapW != null ? this.__hudCoordWrapW : 120;
    var clearX =
      this.__hudCoordX != null
        ? this.__hudCoordX
        : this.getYAxisLabelClearanceX();
    var clearX =
      this.__yAxisLabelClearanceX != null
        ? this.__yAxisLabelClearanceX
        : this.getYAxisLabelClearanceX();
    var coordReserve = isPortraitHud
      ? Math.max(clearX + coordW + 10, Math.floor(w * 0.32))
      : Math.max(clearX + coordW + 12, (this.gridOriginX || 0) + 10) - (this.gridOriginX || 0);
    var panelMaxW = Math.min(
      isPortraitHud ? w - coordReserve - 12 : gridW - coordReserve - 12,
      isPortraitHud ? (isCompact ? 220 : 268) : isCompact ? 280 : 320
    );
    panelMaxW = Math.max(148, panelMaxW);
    var marginRight = isPortraitHud ? 8 : 10;
    var cx = isPortraitHud
      ? w - marginRight - panelMaxW / 2
      : this.gridOriginX + gridW - marginRight - panelMaxW / 2;
    var panelX = cx - panelMaxW / 2;
    if (isPortraitHud && panelX < coordReserve + 4) {
      panelX = coordReserve + 4;
      cx = panelX + panelMaxW / 2;
    }
    return {
      w: w,
      cx: cx,
      panelX: panelX,
      panelMaxW: panelMaxW,
      topY: isPortraitHud ? 6 : this.gridOriginY + 6,
      isPortraitHud: isPortraitHud,
      isCompact: isCompact
    };
  };

  /* Panel mini de misión actual: una sola tarjeta delgada con la tarea en
     curso, número y total. Las completadas no se listan; al avanzar, el
     texto se reemplaza con una animación suave. */
  GameScene.prototype.buildTaskListHud = function () {
    if (!this.hasTareas()) return;
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    if (h <= w && w >= 700) {
      this._taskListHudDesktopHidden = true;
      return;
    }
    this._taskListHudDesktopHidden = false;
    var self = this;
    var layout = this.computeTaskListHudLayout();
    var cx = layout.cx;
    var panelMaxW = layout.panelMaxW;
    var topY = layout.topY;
    var isCompact = layout.isCompact;
    var isPortraitHud = layout.isPortraitHud;
    var titleFs = isPortraitHud ? 10 : isCompact ? 11 : 12;
    var lineFs = isPortraitHud ? 11 : isCompact ? 12 : 13;
    var family = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var pad = isPortraitHud ? 6 : 8;

    this._taskListBg = this.add.graphics().setScrollFactor(0).setDepth(2603);

    /* Encabezado mini: "🎯 Misión 3/6". */
    var headerStr = this.formatTaskHeader();
    this._taskListTitle = this.add
      .text(cx, topY + pad, headerStr, {
        fontFamily: family,
        fontSize: titleFs + 'px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: 2
      })
      .setOrigin(isPortraitHud ? 0 : 0.5, 0)
      .setScrollFactor(0)
      .setDepth(2606);
    if (isPortraitHud) {
      this._taskListTitle.setX(layout.panelX + 10);
    }

    var lineY = this._taskListTitle.y + this._taskListTitle.height + 4;

    /* Una sola línea con la descripción de la tarea actual. */
    this._taskListCurrent = this.add
      .text(cx, lineY, this.formatCurrentTaskLine(), {
        fontFamily: family,
        fontSize: lineFs + 'px',
        color: '#fde68a',
        fontStyle: 'bold',
        align: isPortraitHud ? 'left' : 'center',
        wordWrap: { width: panelMaxW - 24 },
        stroke: '#0f172a',
        strokeThickness: 2,
        lineSpacing: 2
      })
      .setOrigin(isPortraitHud ? 0 : 0.5, 0)
      .setScrollFactor(0)
      .setDepth(2606);
    if (isPortraitHud) {
      this._taskListCurrent.setX(layout.panelX + 10);
    }

    lineY += this._taskListCurrent.height + pad;

    this._taskListBgGeom = {
      x: layout.panelX,
      y: topY,
      w: panelMaxW,
      h: lineY - topY
    };
    this._taskListHudLayout = layout;

    /* ===== Botón "ocultar / mostrar" ===== */
    var btnR = isCompact ? 11 : 13;
    var btnCx = this._taskListBgGeom.x + this._taskListBgGeom.w - btnR - 6;
    var btnCy = this._taskListBgGeom.y + btnR + 6;
    this._taskListToggleBg = this.add.graphics().setScrollFactor(0).setDepth(2607);
    this._taskListToggleIcon = this.add
      .text(btnCx, btnCy, '🙈', {
        fontFamily: 'system-ui, "Segoe UI Emoji", sans-serif',
        fontSize: (btnR + 4) + 'px',
        color: '#fff'
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2608);
    this._taskListToggleHit = this.add
      .zone(btnCx, btnCy, btnR * 2 + 6, btnR * 2 + 6)
      .setScrollFactor(0)
      .setDepth(2609)
      .setInteractive({ useHandCursor: true });
    this._taskListToggleGeom = { cx: btnCx, cy: btnCy, r: btnR };

    this._taskListPillBg = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(2605)
      .setVisible(false);
    this._taskListPillText = this.add
      .text(cx, this._taskListBgGeom.y + 12, '🎯 Ver misión', {
        fontFamily: family,
        fontSize: (titleFs + 1) + 'px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2607)
      .setVisible(false);
    this._taskListPillHit = this.add
      .zone(cx, this._taskListBgGeom.y + 12, panelMaxW * 0.5, 28)
      .setScrollFactor(0)
      .setDepth(2609)
      .setVisible(false);

    this._taskListCollapsed = false;
    this._taskListToggleHit.on('pointerdown', function () {
      self.setTaskListCollapsed(true);
    });
    var openHandler = function () { self.setTaskListCollapsed(false); };
    this._taskListPillHit.setInteractive({ useHandCursor: true });
    this._taskListPillHit.on('pointerdown', openHandler);

    this.redrawTaskListBg();
    this.renderTaskList();
  };

  GameScene.prototype.redrawTaskListBg = function () {
    if (!this._taskListBg || !this._taskListBgGeom) return;
    var g = this._taskListBgGeom;
    this._taskListBg.clear();
    this._taskListBg.fillStyle(0x1e3a5f, 0.88);
    this._taskListBg.lineStyle(2, 0xfacc15, 0.8);
    this._taskListBg.fillRoundedRect(g.x, g.y, g.w, g.h, 12);
    this._taskListBg.strokeRoundedRect(g.x, g.y, g.w, g.h, 12);

    /* Botón circular del toggle (ojo). */
    var b = this._taskListToggleGeom;
    if (b && this._taskListToggleBg) {
      this._taskListToggleBg.clear();
      this._taskListToggleBg.fillStyle(0x0b1f33, 0.92);
      this._taskListToggleBg.lineStyle(1.5, 0xfacc15, 0.9);
      this._taskListToggleBg.fillCircle(b.cx, b.cy, b.r);
      this._taskListToggleBg.strokeCircle(b.cx, b.cy, b.r);
    }
  };

  /* Píldora flotante que aparece cuando el panel está oculto. */
  GameScene.prototype.redrawTaskListPill = function () {
    if (!this._taskListPillBg || !this._taskListPillText) return;
    var tb = this._taskListPillText.getBounds();
    var padX = 14;
    var padY = 6;
    var w = tb.width + padX * 2;
    var h = tb.height + padY * 2;
    var x = tb.centerX - w / 2;
    var y = tb.centerY - h / 2;
    this._taskListPillBg.clear();
    this._taskListPillBg.fillStyle(0x1e3a5f, 0.88);
    this._taskListPillBg.lineStyle(2, 0xfacc15, 0.85);
    this._taskListPillBg.fillRoundedRect(x, y, w, h, h / 2);
    this._taskListPillBg.strokeRoundedRect(x, y, w, h, h / 2);
    if (this._taskListPillHit) {
      this._taskListPillHit.setPosition(tb.centerX, tb.centerY);
      this._taskListPillHit.setSize(w, h);
    }
  };

  GameScene.prototype.setTaskListCollapsed = function (collapsed) {
    this._taskListCollapsed = !!collapsed;
    var showFull = !this._taskListCollapsed;
    if (this._taskListBg) this._taskListBg.setVisible(showFull);
    if (this._taskListTitle) this._taskListTitle.setVisible(showFull);
    if (this._taskListCurrent) this._taskListCurrent.setVisible(showFull);
    if (this._taskListToggleBg) this._taskListToggleBg.setVisible(showFull);
    if (this._taskListToggleIcon) this._taskListToggleIcon.setVisible(showFull);
    if (this._taskListToggleHit) {
      this._taskListToggleHit.setVisible(showFull);
      if (showFull) this._taskListToggleHit.setInteractive({ useHandCursor: true });
      else this._taskListToggleHit.disableInteractive();
    }

    if (this._taskListPillBg) this._taskListPillBg.setVisible(this._taskListCollapsed);
    if (this._taskListPillText) this._taskListPillText.setVisible(this._taskListCollapsed);
    if (this._taskListPillHit) {
      this._taskListPillHit.setVisible(this._taskListCollapsed);
      if (this._taskListCollapsed) this._taskListPillHit.setInteractive({ useHandCursor: true });
      else this._taskListPillHit.disableInteractive();
    }
    if (this._taskListCollapsed) this.redrawTaskListPill();
  };

  GameScene.prototype.formatTaskHeader = function () {
    var total = (this.level && this.level.tareas) ? this.level.tareas.length : 0;
    if (this.allTareasDone()) return '🎯 ¡Misiones completas!';
    var idx = Math.min(this._taskIndex + 1, total);
    return '🎯 Misión ' + idx + ' / ' + total;
  };

  GameScene.prototype.formatCurrentTaskLine = function () {
    if (this.allTareasDone()) return '¡Buen trabajo, Penny!';
    var t = this.getCurrentTask();
    return '👉 ' + (t && t.desc ? t.desc : '...');
  };

  /* Re-pinta el panel-mini con la tarea actual. Si la descripción cambia
     respecto a la última, anima el cambio (fade-out / fade-in) y reajusta la
     altura del fondo. */
  GameScene.prototype.renderTaskList = function () {
    if (this._taskListHudDesktopHidden) {
      if (this.allMissionTasksOnComplete()) this.setPlayDialogDockVisible(false);
      else this.updatePlayDialogDock();
      return;
    }
    if (!this._taskListCurrent || !this._taskListTitle) return;
    var self = this;
    var newHeader = this.formatTaskHeader();
    var newLine = this.formatCurrentTaskLine();
    var prevLine = this._taskListCurrent.text;

    var applyTexts = function () {
      self._taskListTitle.setText(newHeader);
      self._taskListCurrent.setText(newLine);
      if (self.allTareasDone()) {
        self._taskListCurrent.setColor('#86efac');
      } else {
        self._taskListCurrent.setColor('#fde68a');
      }
      self.relayoutTaskListPanel();
    };

    if (prevLine && prevLine !== newLine && this.tweens) {
      this.tweens.add({
        targets: this._taskListCurrent,
        alpha: 0,
        duration: 160,
        ease: 'Sine.easeIn',
        onComplete: function () {
          applyTexts();
          self.tweens.add({
            targets: self._taskListCurrent,
            alpha: 1,
            duration: 200,
            ease: 'Sine.easeOut'
          });
        }
      });
    } else {
      applyTexts();
    }
    if (this.allMissionTasksOnComplete()) this.setPlayDialogDockVisible(false);
    else this.updatePlayDialogDock();
  };

  /* Recalcula altura del panel-mini con base en la altura real del texto
     actual y re-dibuja fondo + posición del toggle. */
  GameScene.prototype.relayoutTaskListPanel = function () {
    if (!this._taskListBgGeom || !this._taskListCurrent || !this._taskListTitle) return;
    var layout = this._taskListHudLayout || this.computeTaskListHudLayout();
    var pad = layout.isPortraitHud ? 6 : 8;
    var topY = this._taskListBgGeom.y;
    var newY = this._taskListTitle.y + this._taskListTitle.height + 4;
    this._taskListCurrent.setY(newY);
    if (layout.isPortraitHud) {
      this._taskListCurrent.setX(layout.panelX + 10);
    }
    var bottomY = newY + this._taskListCurrent.height + pad;
    this._taskListBgGeom.h = bottomY - topY;

    /* Botón ojo siempre en esquina superior derecha del panel. */
    if (this._taskListToggleGeom) {
      var btnR = this._taskListToggleGeom.r;
      this._taskListToggleGeom.cx = this._taskListBgGeom.x + this._taskListBgGeom.w - btnR - 6;
      this._taskListToggleGeom.cy = this._taskListBgGeom.y + btnR + 6;
      if (this._taskListToggleIcon) {
        this._taskListToggleIcon.setPosition(this._taskListToggleGeom.cx, this._taskListToggleGeom.cy);
      }
      if (this._taskListToggleHit) {
        this._taskListToggleHit.setPosition(this._taskListToggleGeom.cx, this._taskListToggleGeom.cy);
      }
    }
    this.redrawTaskListBg();
  };

  /** Cruce de líneas de la rejilla en la coordenada cartesiana (cx, cy). */
  GameScene.prototype.metaMarkerWorldPos = function (cx, cy) {
    var plane = this.ensurePlaneMetrics();
    var vx = this.cartXToScreenX(cx);
    var originVy = this.gridOriginY + this.cellSize * plane.alto;
    var vy = originVy - (cy - plane.yMin) * this.cellSize;
    return { x: vx, y: vy };
  };

  GameScene.prototype.clearMetaMarker = function () {
    var m = this._metaMarkerObjs;
    if (m) {
      if (m.ring && m.ring.destroy) m.ring.destroy();
      if (m.dot && m.dot.destroy) m.dot.destroy();
      if (m.label && m.label.destroy) m.label.destroy();
      if (m.tweenObj && m.tweenObj.remove) m.tweenObj.remove();
    }
    this._metaMarkerObjs = null;
  };

  /** Punto (0, 3) durante el reto de pasos — no pasa por clearMetaMarker(). */
  GameScene.prototype.clearMontanasWaypointMarker = function () {
    var m = this._montanasWpObjs;
    if (m) {
      if (m.tweenObj && m.tweenObj.remove) m.tweenObj.remove();
      if (m.ring && m.ring.destroy) m.ring.destroy();
      if (m.dot && m.dot.destroy) m.dot.destroy();
    }
    this._montanasWpObjs = null;
  };

  /**
   * Nivel 2: mientras cuenta pasos hasta el cofre, el waypoint (0, 3) debe ser robusto
   * (varias llamadas a showMetaMarker lo borraban/recreaban y a veces quedaba sin marcar).
   */
  GameScene.prototype.syncMontanasWaypointMarker = function () {
    var need =
      this.level &&
      this.level.id === 2 &&
      this._limiteActivo &&
      this.hasTareas() &&
      !this.allTareasDone() &&
      this._taskIndex >= 15 &&
      this._taskIndex <= 16;
    if (!need) {
      this.clearMontanasWaypointMarker();
      return;
    }
    if (this.gridOriginX == null || this.cellSize == null) return;
    var pos = this.metaMarkerWorldPos(0, 3);
    if (
      this._montanasWpObjs &&
      this._montanasWpObjs.ring &&
      this._montanasWpObjs.ring.active &&
      this._montanasWpObjs.dot &&
      this._montanasWpObjs.dot.active
    ) {
      this._montanasWpObjs.ring.setPosition(pos.x, pos.y);
      this._montanasWpObjs.dot.setPosition(pos.x, pos.y);
      return;
    }
    this.clearMontanasWaypointMarker();
    var glow = this.spawnMissionGlowMarker(0, 3);
    if (!glow) return;
    this._montanasWpObjs = { ring: glow.ring, dot: glow.dot, tweenObj: glow.tweenObj };
  };

  GameScene.prototype.levelHasSombreroObjeto = function () {
    if (!this.level || !Array.isArray(this.level.objetos)) return false;
    for (var i = 0; i < this.level.objetos.length; i++) {
      var o = this.level.objetos[i];
      if (o && o.tipo === 'sombrero' && o.x === -3 && o.y === 4) return true;
    }
    return false;
  };

  GameScene.prototype.levelHasSecuazMadEn = function (gx, gy) {
    if (!this.level || !Array.isArray(this.level.objetos)) return false;
    for (var i = 0; i < this.level.objetos.length; i++) {
      var o = this.level.objetos[i];
      if (o && o.tipo === 'secuazMad' && o.x === gx && o.y === gy) return true;
    }
    return false;
  };

  /** Tarea «Sir fulmina al Secuaz»: magiaFlash + volar secuazMad (nivel 2). */
  GameScene.prototype.taskIsMontanasMagiaContraSecuaz = function (task) {
    if (!task || !task.accion || !this.level || this.level.id !== 2) return false;
    var arr = this.normalizeActions(task.accion);
    var magia = arr.some(function (s) {
      return s && s.tipo === 'magiaFlash';
    });
    var secuaz = arr.some(function (s) {
      return (
        s &&
        s.tipo === 'volarObjeto' &&
        s.tipos &&
        s.tipos.indexOf('secuazMad') !== -1
      );
    });
    return magia && secuaz;
  };

  GameScene.prototype.spawnMissionGlowMarker = function (cx, cy) {
    if (this.gridOriginX == null || this.cellSize == null) return null;
    var pos = this.metaMarkerWorldPos(cx, cy);
    var rDot = Math.max(5, Math.floor(this.cellSize * 0.09));
    var rRing = Math.max(10, Math.floor(this.cellSize * 0.15));
    /* Por encima de Penny (≈16) y NPCs (≈14–15), por debajo del HUD de ejes. */
    var depth = 200;
    var ring = this.add
      .circle(pos.x, pos.y, rRing, 0xfacc15, 0.32)
      .setStrokeStyle(2.5, 0xfacc15, 0.95)
      .setDepth(depth);
    var dot = this.add
      .circle(pos.x, pos.y, rDot, 0xfacc15, 1)
      .setStrokeStyle(2, 0x1a1208, 1)
      .setDepth(depth + 1);
    /* Solo escala: animar alpha hacia valores bajos parecía que el punto “desaparecía”. */
    var tw = this.tweens.add({
      targets: ring,
      scale: { from: 1, to: 1.38 },
      duration: 780,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
    return { ring: ring, dot: dot, tweenObj: tw };
  };

  /** Punto fijo en (−3, 4) mientras el sombrero siga en el mapa (nivel 2). */
  GameScene.prototype.clearSombreroDestMarker = function () {
    var m = this._sombreroDestMarker;
    if (m) {
      if (m.tweenObj && m.tweenObj.remove) m.tweenObj.remove();
      if (m.ring && m.ring.destroy) m.ring.destroy();
      if (m.dot && m.dot.destroy) m.dot.destroy();
    }
    this._sombreroDestMarker = null;
  };

  GameScene.prototype.syncSombreroDestMarker = function () {
    if (!this.level || this.level.id !== 2 || !this.levelHasSombreroObjeto()) {
      this.clearSombreroDestMarker();
      return;
    }
    if (this.gridOriginX == null || this.cellSize == null) return;
    var pos = this.metaMarkerWorldPos(-3, 4);
    if (this._sombreroDestMarker && this._sombreroDestMarker.ring && this._sombreroDestMarker.ring.active) {
      this._sombreroDestMarker.ring.setPosition(pos.x, pos.y);
      this._sombreroDestMarker.dot.setPosition(pos.x, pos.y);
      this._sombreroDestMarker.ring.setDepth(24);
      this._sombreroDestMarker.dot.setDepth(25);
      return;
    }
    this.clearSombreroDestMarker();
    this._sombreroDestMarker = this.spawnMissionGlowMarker(-3, 4);
  };

  GameScene.prototype.clearQuestionAxisGuides = function () {
    if (this._questionAxisGuidesGfx) {
      try {
        this._questionAxisGuidesGfx.destroy();
      } catch (eQg) {}
      this._questionAxisGuidesGfx = null;
    }
  };

  GameScene.prototype.drawDashedSegmentV = function (gfx, x, y0, y1, dash, gap) {
    var y = y0;
    while (y < y1) {
      var yEnd = Math.min(y + dash, y1);
      gfx.lineBetween(x, y, x, yEnd);
      y = yEnd + gap;
    }
  };

  GameScene.prototype.drawDashedSegmentH = function (gfx, x0, x1, y, dash, gap) {
    var x = x0;
    while (x < x1) {
      var xEnd = Math.min(x + dash, x1);
      gfx.lineBetween(x, y, xEnd, y);
      x = xEnd + gap;
    }
  };

  GameScene.prototype.cartesianYToScreenLineY = function (cy) {
    var plane = this.ensurePlaneMetrics();
    var gy = cy - plane.yMin;
    return this.gridOriginY + (plane.alto - gy) * this.cellSize;
  };

  GameScene.prototype.buildAxisGuidesGraphics = function (guide) {
    if (!guide || this.gridOriginX == null || this.cellSize == null) return null;
    var dash = Math.max(6, Math.floor(this.cellSize * 0.14));
    var gap = Math.max(5, Math.floor(this.cellSize * 0.1));
    var g = this.add.graphics();
    var drew = false;

    var dist = guide.distanciaX || guide.distanciaEnX;
    if (dist && dist.x1 != null && dist.x2 != null) {
      g.lineStyle(3, 0xf59e0b, 0.95);
      var cy = dist.y != null ? dist.y : 2;
      var vy = this.cartesianYToScreenLineY(cy);
      var vx1 = this.cartXToScreenX(dist.x1);
      var vx2 = this.cartXToScreenX(dist.x2);
      var xLo = Math.min(vx1, vx2);
      var xHi = Math.max(vx1, vx2);
      this.drawDashedSegmentH(g, xLo, xHi, vy, dash, gap);
      drew = true;
    }

    var verts = guide.verticales || guide.verticalX;
    if (verts && verts.length) {
      var plane = this.ensurePlaneMetrics();
      var yCima = guide.alturaCompleta
        ? this.cartesianYToScreenLineY(plane.yMax)
        : this.cartesianYToScreenLineY(guide.cimaY != null ? guide.cimaY : 4);
      var yBase = this.cartesianYToScreenLineY(plane.yMin);
      for (var i = 0; i < verts.length; i++) {
        var spec = verts[i];
        var cx = typeof spec === 'object' ? spec.x : spec;
        if (cx == null) continue;
        var col = typeof spec === 'object' && spec.color != null ? spec.color : 0xfacc15;
        var vx = this.cartXToScreenX(cx);
        g.lineStyle(3.5, col, 0.92);
        this.drawDashedSegmentV(g, vx, yCima, yBase, dash, gap);
        drew = true;
      }
    }

    if (!drew) {
      g.destroy();
      return null;
    }
    return g;
  };

  /** Líneas guía en el plano (solo durante una pregunta). */
  GameScene.prototype.showQuestionAxisGuides = function (guide) {
    this.clearQuestionAxisGuides();
    var g = this.buildAxisGuidesGraphics(guide);
    if (!g) return;
    g.setDepth(5);
    this._questionAxisGuidesGfx = g;
  };

  GameScene.prototype.clearMissionAxisGuides = function () {
    if (this._missionAxisGuidesGfx) {
      try {
        this._missionAxisGuidesGfx.destroy();
      } catch (eMg) {}
      this._missionAxisGuidesGfx = null;
    }
  };

  /** Línea guía de misión (p. ej. recta x = −5) hasta cumplir la meta. */
  GameScene.prototype.syncMissionAxisGuides = function () {
    this.clearMissionAxisGuides();
    if (!this.hasTareas() || this.allTareasDone()) return;
    var task = this.getCurrentTask();
    if (!task || !task.guiaMision || !task.meta) return;
    var metaOk = this.isMetaSatisfied(task.meta, this.pos);
    /* Si hay marcador explícito {x,y}, seguir mostrando guía hasta pisar esa casilla
       (p. ej. Sir en (−4, 5) con waypoint (0, 3): la meta “hablar” ya está cumplida). */
    var marc = task.meta.marcador;
    var hasWaypoint =
      marc && typeof marc === 'object' && !Array.isArray(marc) && marc.x != null && marc.y != null;
    var waypointOk =
      !hasWaypoint || (this.pos.x === marc.x && this.pos.y === marc.y);
    if (metaOk && waypointOk) return;
    var g = this.buildAxisGuidesGraphics(task.guiaMision);
    if (!g) return;
    g.setDepth(4);
    this._missionAxisGuidesGfx = g;
  };

  GameScene.prototype.showMetaMarker = function () {
    this.clearMetaMarker();
    this.syncMissionAxisGuides();
    if (typeof this.syncSecuazFog === 'function') this.syncSecuazFog();
    if (!this.hasTareas() || this.allTareasDone()) {
      this.clearMontanasWaypointMarker();
      return;
    }
    var montanasWpPhase =
      this.level &&
      this.level.id === 2 &&
      this._limiteActivo &&
      this._taskIndex >= 15 &&
      this._taskIndex <= 16;
    if (montanasWpPhase) {
      this.syncMontanasWaypointMarker();
      return;
    }
    this.clearMontanasWaypointMarker();
    var task = this.getCurrentTask();
    if (!task || !task.meta) return;
    if (task.meta.marcador === false) return;

    /* Punto del marcador:
       - meta.marcador = { x, y } → marca esa coordenada (útil cuando la meta es
         caminar a un personaje pero la pregunta se refiere a otra coordenada).
       - meta.marcador = true / undefined → marca la coord. de la meta.
       - marcador.ocultarLabel ó meta.ocultarLabel = true → oculta el "(x, y)"
         para no regalar la respuesta cuando la pregunta es esa coordenada. */
    var x = null;
    var y = null;
    var ocultarLabel = !!task.meta.ocultarLabel;
    var marc = task.meta.marcador;
    if (marc && typeof marc === 'object' && !Array.isArray(marc)) {
      if (marc.x != null) x = marc.x;
      if (marc.y != null) y = marc.y;
      if (marc.ocultarLabel) ocultarLabel = true;
    }
    if (task.meta.tipo === 'cofre') {
      x = this.level.tesoro.x;
      y = this.level.tesoro.y;
    } else if (task.meta.tipo === 'vecino' || task.meta.tipo === 'casilla') {
      if (x == null) x = task.meta.x;
      if (y == null) y = task.meta.y;
    } else {
      return;
    }
    if (x == null || y == null) return;

    /* Nivel 2: marcador fijo del sombrero (no depende del índice de tarea). */
    if (this.level && this.level.id === 2 && x === -3 && y === 4 && this.levelHasSombreroObjeto()) {
      this.syncSombreroDestMarker();
      return;
    }

    var plane = this.ensurePlaneMetrics();
    var pos = this.metaMarkerWorldPos(x, y);
    var mx = pos.x;
    var my = pos.y;
    var glow = this.spawnMissionGlowMarker(x, y);
    if (!glow) return;
    var ring = glow.ring;
    var dot = glow.dot;
    var tw = glow.tweenObj;

    var label = null;
    if (!ocultarLabel) {
      label = this.add
        .text(mx + 12, my - 12, '(' + x + ', ' + y + ')', {
          fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
          fontSize: '13px',
          color: '#fef3c7',
          fontStyle: 'bold',
          backgroundColor: 'rgba(30, 58, 95, 0.95)',
          padding: { x: 7, y: 3 },
          stroke: '#1a0c08',
          strokeThickness: 3
        })
        .setOrigin(0, 1)
        .setDepth(202);

      /* Si la etiqueta se sale a la derecha del mapa, la pongo a la izquierda del punto. */
      var rightLimit = this.gridOriginX + this.cellSize * plane.ancho - 4;
      if (label.x + label.width > rightLimit) {
        label.setOrigin(1, 1);
        label.setX(mx - 12);
      }
      /* Si se sale por arriba, la pongo debajo del punto. */
      if (label.y - label.height < this.gridOriginY + 2) {
        label.setOrigin(label.originX, 0);
        label.setY(my + 12);
      }
    }

    this._metaMarkerObjs = { ring: ring, dot: dot, label: label, tweenObj: tw };
  };

  /* === Posicionamiento del modal de tarea (pregunta / aviso) ==============
     Recoge varias casillas de interés (meta, marcador, cofre, lista extra)
     y coloca el panel en una esquina del área de juego con mínimo solape,
     para que el paisaje y los ejes sigan siendo legibles.
  ==================================================================== */
  GameScene.prototype.collectTaskModalFocalBBox = function (task) {
    var self = this;
    if (!task || !task.meta) return null;
    var pts = [];
    function add(gx, gy) {
      if (gx == null || gy == null) return;
      pts.push(self.gridToWorldCart(gx, gy));
    }
    var m = task.meta;
    if (m.marcador && typeof m.marcador === 'object' && m.marcador.x != null) {
      add(m.marcador.x, m.marcador.y);
    }
    if (m.tipo === 'vecino' || m.tipo === 'casilla') {
      add(m.x, m.y);
    }
    if (m.tipo === 'cofre' && this.level && this.level.tesoro) {
      add(this.level.tesoro.x, this.level.tesoro.y);
    }
    var extra =
      (task.pregunta && task.pregunta.focosCoordenadas) ||
      (task.aviso && task.aviso.focosCoordenadas);
    if (Array.isArray(extra)) {
      for (var ei = 0; ei < extra.length; ei++) {
        var f = extra[ei];
        if (f && f.x != null) add(f.x, f.y);
      }
    }
    if (!pts.length) return null;
    var pad = this.cellSize != null ? this.cellSize * 0.6 : 44;
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i];
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
    return { left: minX - pad, right: maxX + pad, top: minY - pad, bottom: maxY + pad };
  };

  /** Zona izquierda del plano (desde el eje y) para modales de tarea/pregunta.
     widthRatio: fracción del ancho del plano (desde startX), p. ej. 0.5 = mitad, 0.64 = un poco más ancho. */
  GameScene.prototype.getTaskModalLeftColumnBounds = function (opts) {
    var play = this.__playArea;
    var playX = play && play.x != null ? play.x : 0;
    var playW = play && play.w != null ? play.w : this.cameras.main.width;
    var widthRatio =
      opts && opts.widthRatio != null ? Phaser.Math.Clamp(opts.widthRatio, 0.42, 0.72) : 0.5;
    var yReserve = Math.max(
      28,
      this.__xLabelReserve != null ? this.__xLabelReserve : 0,
      Math.floor(this.cellSize * 0.55)
    );
    var startX =
      this.gridOriginX != null ? this.gridOriginX + yReserve + 4 : playX + 8;
    var halfRight = playX + playW * widthRatio;
    var maxW = Math.max(150, halfRight - startX - 8);
    return { startX: startX, maxW: maxW, halfRight: halfRight, widthRatio: widthRatio };
  };

  GameScene.prototype.pickTaskModalCorner = function (panelW, panelH, bbox, preferSide, layoutOpts) {
    var play = this.__playArea;
    var W = this.cameras.main.width;
    var H = this.cameras.main.height;
    var margin = 8;
    var isPortrait = H > W;
    var playX = play && play.x != null ? play.x : 0;
    var playY = play && play.y != null ? play.y : 0;
    var playW = play && play.w != null ? play.w : W;
    var playH = play && play.h != null ? play.h : H;
    var leftCol = this.getTaskModalLeftColumnBounds(layoutOpts);
    var useLeftHalf = preferSide !== 'right';
    var pw = Math.min(panelW, useLeftHalf ? leftCol.maxW : playW - margin * 2);
    var ph = Math.min(panelH, playH - margin * 2);
    pw = Math.max(150, pw);
    ph = Math.max(100, ph);

    function overlap(px, py) {
      if (!bbox) return 0;
      var L = Math.max(px, bbox.left);
      var R = Math.min(px + pw, bbox.right);
      var T = Math.max(py, bbox.top);
      var B = Math.min(py + ph, bbox.bottom);
      if (R <= L || B <= T) return 0;
      return (R - L) * (B - T);
    }

    function clamp(px, py) {
      var minX = useLeftHalf ? leftCol.startX : playX + margin;
      var maxX = useLeftHalf ? leftCol.halfRight - pw - margin : playX + playW - pw - margin;
      var nx = Phaser.Math.Clamp(px, minX, maxX);
      var ny = Phaser.Math.Clamp(py, playY + margin, playY + playH - ph - margin);
      return { px: nx, py: ny };
    }

    var leftX = useLeftHalf ? leftCol.startX : playX + margin;
    var rightX = useLeftHalf ? leftCol.halfRight - pw - margin : playX + playW - pw - margin;
    var raw = [
      { id: 'BL', px: leftX, py: playY + playH - ph - margin },
      { id: 'BR', px: rightX, py: playY + playH - ph - margin },
      { id: 'TL', px: leftX, py: playY + margin },
      { id: 'TR', px: rightX, py: playY + margin },
      { id: 'ML', px: leftX, py: playY + (playH - ph) / 2 },
      { id: 'MR', px: rightX, py: playY + (playH - ph) / 2 },
      { id: 'BC', px: playX + (playW - pw) / 2, py: playY + playH - ph - margin },
      { id: 'TC', px: playX + (playW - pw) / 2, py: playY + margin }
    ];

    if (useLeftHalf) {
      raw = raw.filter(function (c) {
        return c.id === 'TL' || c.id === 'ML' || c.id === 'BL';
      });
    } else if (preferSide === 'right') {
      raw = raw.filter(function (c) {
        return c.id === 'TR' || c.id === 'MR' || c.id === 'BR';
      });
    }

    var orderPref = useLeftHalf
      ? { TL: 0, ML: 1, BL: 2 }
      : preferSide === 'right'
        ? { TR: 0, MR: 1, BR: 2 }
        : { BL: 0, BR: 1, ML: 2, MR: 3, BC: 4, TL: 5, TR: 6, TC: 7 };
    var best = null;
    var bestOv = Infinity;
    for (var ri = 0; ri < raw.length; ri++) {
      var c = raw[ri];
      var cl = clamp(c.px, c.py);
      var ov = overlap(cl.px, cl.py);
      if (ov < bestOv || (ov === bestOv && best && orderPref[c.id] < orderPref[best.id])) {
        bestOv = ov;
        best = { id: c.id, px: cl.px, py: cl.py };
      }
    }
    if (!best) {
      var d = clamp(playX + (playW - pw) / 2, playY + playH - ph - margin);
      best = { id: 'BC', px: d.px, py: d.py };
    }
    return { px: best.px, py: best.py, anchorId: best.id };
  };

  function computeDialogDockHeight(viewW, viewH) {
    var isPortrait = viewH > viewW;
    if (isPortrait) {
      return Phaser.Math.Clamp(Math.floor(viewH * 0.36), 180, Math.floor(viewH * 0.44));
    }
    var isDesktopWide = viewW >= 700;
    if (isDesktopWide) {
      return Phaser.Math.Clamp(Math.floor(viewH * 0.17), 108, 148);
    }
    return Phaser.Math.Clamp(Math.floor(viewH * 0.18), 112, Math.floor(viewH * 0.22));
  }

  /** Borde inferior del plano: el diálogo empieza aquí (sin hueco con el mapa). */
  GameScene.prototype.getDialogSafeTopY = function () {
    var planeBottom = this.__planeStackBottomY;
    if (planeBottom == null && this.gridOriginY != null && this.cellSize != null) {
      planeBottom = this.gridOriginY + this.ensurePlaneMetrics().alto * this.cellSize;
    }
    return planeBottom != null ? planeBottom : 0;
  };

  /** Panel inferior pegado al mapa (arriba) y al borde de pantalla (abajo). */
  GameScene.prototype.layoutPlayBottomPanel = function (opts) {
    opts = opts || {};
    var viewH = this.cameras.main.height;
    var viewW = this.cameras.main.width;
    var isPortrait = viewH > viewW;
    var mb =
      this.__dialogDockMarginBottom != null
        ? this.__dialogDockMarginBottom
        : isPortrait
          ? 0
          : 0;
    var safeTop = this.getDialogSafeTopY();
    var minH = opts.minH != null ? opts.minH : 64;
    var fullH = Math.max(minH, viewH - mb - safeTop);
    return {
      py: safeTop,
      panelH: fullH,
      safeTop: safeTop,
      marginBottom: mb,
      maxContentH: fullH
    };
  };

  /** Franja fija inferior: diálogos y preguntas (estilo RPG). */
  GameScene.prototype.getBottomDialogDock = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var isPortrait = h > w;
    var isDesktopWide = !isPortrait && w >= 700;
    var marginBottom =
      this.__dialogDockMarginBottom != null
        ? this.__dialogDockMarginBottom
        : isDesktopWide
          ? 0
          : isPortrait
            ? 0
            : Math.max(6, Math.floor(w * 0.018));
    var marginSide = isDesktopWide ? 8 : Math.max(6, Math.floor(w * 0.018));
    var dockTopY;
    var dockH;
    if (this.__dialogDockTopY != null && this.__planeStackBottomY != null) {
      dockTopY = this.__dialogDockTopY;
      dockH = Math.max(64, h - dockTopY - marginBottom);
    } else {
      dockH =
        this.__dialogDockH != null
          ? this.__dialogDockH
          : computeDialogDockHeight(w, h);
      dockTopY = h - dockH - marginBottom;
      this.__dialogDockTopY = dockTopY;
    }
    var play = this.__playArea;
    var playW = play && play.w > 0 ? play.w : 0;
    var playX = play && play.x != null ? play.x : 0;
    var maxPanelW = w - marginSide * 2;
    if (isDesktopWide) {
      maxPanelW = Math.min(
        w - marginSide * 2,
        Math.max(360, playW > 0 ? playW + 24 : Math.floor(w * 0.5))
      );
    }
    var panelW = Math.min(w - marginSide * 2, maxPanelW);
    var panelX =
      isDesktopWide && playW > 0
        ? Phaser.Math.Clamp(playX + playW * 0.5 - panelW * 0.5, marginSide, w - marginSide - panelW)
        : (w - panelW) * 0.5;
    return {
      x: panelX,
      y: dockTopY,
      w: panelW,
      h: dockH,
      cx: panelX + panelW * 0.5,
      padX: isPortrait ? 10 : isDesktopWide ? 10 : 12,
      innerW: panelW - (isPortrait ? 20 : isDesktopWide ? 20 : 24),
      bandH: isDesktopWide ? 14 : 17,
      margin: marginBottom,
      marginBottom: marginBottom,
      isPortrait: isPortrait,
      isDesktopWide: isDesktopWide,
      tight: w < 520 || h < 600
    };
  };

  /** Etiqueta de eje: +3, −3 (menos tipográfico pegado al número, no «- 3»). */
  function formatAxisTickLabel(n) {
    if (n > 0) return '+' + n;
    if (n < 0) return '\u2212' + Math.abs(n);
    return '0';
  }

  function countDialogWords(text) {
    return String(text || '')
      .trim()
      .split(/\s+/)
      .filter(function (w) {
        return w.length > 0;
      }).length;
  }

  /** Evita pantallitas con una o dos palabras sueltas al final. */
  function normalizeDialogPages(pages, minTailWords) {
    minTailWords = minTailWords != null ? minTailWords : 4;
    var out = pages.slice();
    while (out.length > 1) {
      var tail = out[out.length - 1].trim();
      var tailWords = countDialogWords(tail);
      var punctuationOnly = /^[\s\?\!\.\,\;\:\¡\¿\"\'«»\-…]+$/.test(tail);
      if (tailWords >= minTailWords && !punctuationOnly) break;
      out[out.length - 2] = (out[out.length - 2] + ' ' + tail).trim();
      out.pop();
    }
    return out.length ? out : [''];
  }

  GameScene.prototype.paginateDialogText = function (text, innerW, fontPx, maxBodyH, fontFamily, lineSpacing) {
    var self = this;
    var ls = lineSpacing != null ? lineSpacing : PLAY_DIALOG_LINE_SPACING;
    var remaining = String(text || '').trim();
    if (!remaining) return [''];
    var pages = [];
    var guard = 0;
    var maxOrphanWords = 4;

    function fits(chunk) {
      if (!chunk || !chunk.trim()) return true;
      return (
        self.measureDialogTextHeight(chunk, innerW, fontPx, fontFamily, ls) <= maxBodyH
      );
    }

    while (remaining.length > 0 && guard < 10) {
      guard += 1;
      if (fits(remaining)) {
        pages.push(remaining);
        remaining = '';
        break;
      }

      var paraIdx = remaining.indexOf('\n\n');
      if (paraIdx > 0) {
        var paraOnly = remaining.slice(0, paraIdx).trim();
        if (paraOnly.length && fits(paraOnly)) {
          pages.push(paraOnly);
          remaining = remaining.slice(paraIdx).trim();
          continue;
        }
      }

      var lo = 1;
      var hi = remaining.length;
      var best = 1;
      while (lo <= hi) {
        var mid = Math.ceil((lo + hi) / 2);
        if (fits(remaining.slice(0, mid))) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      var slice = remaining.slice(0, best);
      var lastSpace = slice.lastIndexOf(' ');
      var lastNl = slice.lastIndexOf('\n');
      var breakAt = Math.max(lastSpace, lastNl);
      if (breakAt > Math.floor(best * 0.3)) slice = slice.slice(0, breakAt);
      slice = slice.trim();
      if (!slice.length) slice = remaining.slice(0, Math.max(1, best)).trim();

      var rest = remaining.slice(slice.length).trim();
      if (rest.length > 0 && countDialogWords(rest) <= maxOrphanWords && fits(slice + ' ' + rest)) {
        slice = (slice + ' ' + rest).trim();
        rest = '';
      }

      pages.push(slice);
      remaining = rest;
    }

    if (remaining.length) {
      if (pages.length) pages[pages.length - 1] = (pages[pages.length - 1] + ' ' + remaining).trim();
      else pages.push(remaining);
    }
    return normalizeDialogPages(pages.length ? pages : [''], maxOrphanWords);
  };

  GameScene.prototype.measureDialogTextHeight = function (text, innerW, fontPx, fontFamily, lineSpacing) {
    var probe = this.add
      .text(0, 0, text, {
        fontFamily: fontFamily,
        fontSize: fontPx + 'px',
        fontStyle: 'bold',
        wordWrap: { width: innerW },
        lineSpacing: lineSpacing != null ? lineSpacing : PLAY_DIALOG_LINE_SPACING
      })
      .setVisible(false);
    var ht = probe.height;
    probe.destroy();
    return ht;
  };

  /** Sube el tamaño de letra mientras el texto quepa en el alto disponible. */
  GameScene.prototype.fitDialogFontSize = function (text, innerW, startFs, maxFs, maxHeight, fontFamily, lineSpacing) {
    var lo = Math.max(8, startFs);
    var hi = Math.max(lo, maxFs);
    var best = lo;
    for (var fs = lo; fs <= hi; fs++) {
      var h = this.measureDialogTextHeight(text, innerW, fs, fontFamily, lineSpacing);
      if (h <= maxHeight) best = fs;
      else break;
    }
    return best;
  };

  GameScene.prototype.openBottomDialogShell = function (titleStr, opts) {
    opts = opts || {};
    var dock = this.getBottomDialogDock();
    var viewH = this.cameras.main.height;
    var depth = TASK_BOTTOM_MODAL_BASE_DEPTH;
    var px = dock.x;
    var panelW = dock.w;
    var py = opts.py != null ? opts.py : dock.y;
    var maxPanelH = viewH - py;
    var panelH =
      opts.panelH != null
        ? Phaser.Math.Clamp(opts.panelH, 64, maxPanelH)
        : maxPanelH;
    var r = opts.compactRadius != null ? opts.compactRadius : dock.isDesktopWide ? 12 : 14;
    var bandH = dock.bandH;
    var modal = this.add.container(0, 0).setScrollFactor(0).setDepth(depth + 1);

    var shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillRoundedRect(px + 2, py - 1, panelW, panelH + 2, { tl: r, tr: r, bl: 0, br: 0 });
    modal.add(shadow);

    var paper = this.add.graphics();
    paper.fillStyle(0xfff6e3, 0.96);
    paper.fillRoundedRect(px, py, panelW, panelH, { tl: r, tr: r, bl: 0, br: 0 });
    paper.lineStyle(2, 0xd4a259, 0.95);
    paper.strokeRoundedRect(px, py, panelW, panelH, { tl: r, tr: r, bl: 0, br: 0 });
    modal.add(paper);

    var band = this.add.graphics();
    band.fillStyle(0x1e3a5f, 0.9);
    band.fillRoundedRect(px + 6, py + 5, panelW - 12, bandH, { tl: 10, tr: 10, bl: 4, br: 4 });
    band.lineStyle(1, 0xfacc15, 0.8);
    band.strokeRoundedRect(px + 6, py + 5, panelW - 12, bandH, { tl: 10, tr: 10, bl: 4, br: 4 });
    modal.add(band);

    var fsTitle = dock.isDesktopWide ? 11 : dock.tight ? 10 : 12;
    var title = this.add
      .text(dock.cx, py + 5 + bandH / 2, titleStr, {
        fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: fsTitle + 'px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#0b1f33',
        strokeThickness: 2
      })
      .setOrigin(0.5);
    modal.add(title);

    var bodyTop = py + 4 + bandH + 4;
    var bodyBottom = py + panelH - 5;

    modal.setAlpha(0);
    modal.y = 18;
    this.tweens.add({ targets: modal, alpha: 1, y: 0, duration: 240, ease: 'Sine.easeOut' });

    return {
      modal: modal,
      dock: dock,
      depth: depth,
      px: px,
      py: py,
      panelW: panelW,
      panelH: panelH,
      bodyTop: bodyTop,
      bodyBottom: bodyBottom,
      bodyH: bodyBottom - bodyTop,
      innerW: dock.innerW,
      padX: dock.padX,
      titleCx: dock.cx
    };
  };

  GameScene.prototype.getPlayDialogDockBody = function () {
    if (this.allMissionTasksOnComplete()) {
      return '';
    }
    if (this.allTareasDone()) {
      return '¡Misiones listas! Sigue el plano hasta el cofre o el final del recorrido.';
    }
    var t = this.getCurrentTask();
    if (t && t.desc) {
      var parts = [t.desc];
      if (t.dockAyuda && String(t.dockAyuda).trim()) {
        parts.push(String(t.dockAyuda).trim());
      }
      return parts.join('\n\n');
    }
    if (this.level && this.level.playHint) {
      return String(this.level.playHint).split('\n')[0];
    }
    return 'Muévete de a un paso por el plano. Flechas en PC; toca una casilla en celular.';
  };

  /** Caja de orientación fija (siempre visible entre preguntas/avisos). */
  GameScene.prototype.buildPlayDialogDock = function () {
    this.destroyPlayDialogDock();
    var dock = this.getBottomDialogDock();
    var viewH = this.cameras.main.height;
    var py = this.__dialogDockTopY != null ? this.__dialogDockTopY : dock.y;
    var panelH = this.__dialogDockH != null ? this.__dialogDockH : dock.h;
    var px = dock.x;
    var panelW = dock.w;
    var r = dock.isDesktopWide ? 12 : 14;
    var bandH = dock.bandH;
    var depth = PLAY_DIALOG_DOCK_DEPTH;
    var container = this.add.container(0, 0).setScrollFactor(0).setDepth(depth);

    var shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.2);
    shadow.fillRoundedRect(px + 2, py - 1, panelW, panelH + 2, { tl: r, tr: r, bl: 0, br: 0 });
    container.add(shadow);

    var paper = this.add.graphics();
    paper.fillStyle(0xfff6e3, 0.98);
    paper.fillRoundedRect(px, py, panelW, panelH, { tl: r, tr: r, bl: 0, br: 0 });
    paper.lineStyle(2, 0xd4a259, 0.92);
    paper.strokeRoundedRect(px, py, panelW, panelH, { tl: r, tr: r, bl: 0, br: 0 });
    container.add(paper);

    var band = this.add.graphics();
    band.fillStyle(0x1e3a5f, 0.9);
    band.fillRoundedRect(px + 6, py + 5, panelW - 12, bandH, { tl: 10, tr: 10, bl: 4, br: 4 });
    band.lineStyle(1, 0xfacc15, 0.75);
    band.strokeRoundedRect(px + 6, py + 5, panelW - 12, bandH, { tl: 10, tr: 10, bl: 4, br: 4 });
    container.add(band);

    var bodyTop = py + 4 + bandH + 5;
    var bodyMaxH = Math.max(24, panelH - (bodyTop - py) - 10);
    var dockSerif = 'Georgia, "Times New Roman", "Liberation Serif", serif';
    var dockSans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var fsTitle = dock.isDesktopWide
      ? 10
      : dock.isPortrait
        ? this.fitDialogFontSize(this.formatTaskHeader(), dock.innerW, 10, 13, bandH + 4, dockSans, 1)
        : dock.tight
          ? 9
          : 10;
    var fsBodyStart = dock.isDesktopWide ? 11 : dock.isPortrait ? 13 : dock.tight ? 11 : 12;
    var fsBodyMax = dock.isDesktopWide ? 14 : dock.isPortrait ? 19 : 15;
    var fsBody = this.fitDialogFontSize(
      this.getPlayDialogDockBody(),
      dock.innerW,
      fsBodyStart,
      fsBodyMax,
      bodyMaxH,
      dockSerif,
      2
    );
    var title = this.add
      .text(dock.cx, py + 5 + bandH / 2, '', {
        fontFamily: dockSans,
        fontSize: fsTitle + 'px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#0b1f33',
        strokeThickness: 2
      })
      .setOrigin(0.5);
    container.add(title);

    var body = this.add
      .text(px + dock.padX, bodyTop, '', {
        fontFamily: dockSerif,
        fontSize: fsBody + 'px',
        color: '#1a1208',
        fontStyle: 'bold',
        wordWrap: { width: dock.innerW },
        lineSpacing: 2
      })
      .setOrigin(0, 0);
    container.add(body);

    this.__playDialogDock = {
      container: container,
      title: title,
      body: body,
      dock: dock,
      py: py,
      panelH: panelH,
      bodyTop: bodyTop,
      bodyMaxH: bodyMaxH,
      dockSerif: dockSerif,
      dockSans: dockSans,
      fsBodyMax: fsBodyMax,
      fsBodyStart: fsBodyStart
    };
    this.updatePlayDialogDock();
    this.layoutPlaySoundToggle();
  };

  GameScene.prototype.updatePlayDialogDock = function () {
    if (!this.__playDialogDock) return;
    var refs = this.__playDialogDock;
    var dock = refs.dock;
    var headerStr = this.formatTaskHeader();
    var bodyStr = this.getPlayDialogDockBody();
    var bodyMaxH = refs.bodyMaxH != null ? refs.bodyMaxH : 80;
    var fsTitle = dock.isDesktopWide
      ? 10
      : dock.isPortrait
        ? this.fitDialogFontSize(headerStr, dock.innerW, 10, 13, dock.bandH + 4, refs.dockSans, 1)
        : dock.tight
          ? 9
          : 10;
    var fsBody = this.fitDialogFontSize(
      bodyStr,
      dock.innerW,
      refs.fsBodyStart != null ? refs.fsBodyStart : 12,
      refs.fsBodyMax != null ? refs.fsBodyMax : 16,
      bodyMaxH,
      refs.dockSerif,
      2
    );
    refs.title.setText(headerStr);
    refs.title.setFontSize(fsTitle + 'px');
    refs.body.setFontSize(fsBody + 'px');
    refs.body.setText(bodyStr);
  };

  GameScene.prototype.setPlayDialogDockVisible = function (visible) {
    if (this.__playDialogDock && this.__playDialogDock.container) {
      this.__playDialogDock.container.setVisible(visible !== false);
    }
  };

  GameScene.prototype.destroyPlayDialogDock = function () {
    if (this.__playDialogDock && this.__playDialogDock.container) {
      try {
        this.__playDialogDock.container.destroy(true);
      } catch (ePd) {}
    }
    this.__playDialogDock = null;
  };

  /** Icono de sonido dentro del panel de diálogo inferior (esquina inferior derecha). */
  GameScene.prototype.layoutPlaySoundToggle = function () {
    var root = this.__sndPlay;
    if (!root || !root.active) return;
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var compact = w < 520 || h < 560;
    var dock = this.getBottomDialogDock();
    var margin = compact ? 10 : 14;
    var sndPx = resolveSoundToggleSize(this, { size: 'play' });
    if (root.getData('btnSize') !== sndPx) {
      root.setData('btnSize', sndPx);
      paintSoundToggleChrome(root, this);
      refreshSoundToggleHitZone(root, this);
    }
    root.setScale(1);
    var cx = dock.x + dock.w - margin - root.displayWidth * 0.5;
    var cy = dock.y + dock.h - margin - root.displayHeight * 0.5;
    root.setPosition(cx, cy);
    root.setScrollFactor(0);
    root.setDepth(PLAY_SOUND_TOGGLE_DEPTH);
    refreshSoundToggleHitZone(root, this);
  };

  /* === Diálogo fijo inferior (mapa arriba, caja abajo) ================= */
  GameScene.prototype.showTaskQuestion = function (task) {
    var self = this;
    this._taskChainingModal = false;
    this._taskChainingSince = 0;
    this.reconcileTaskModalState();
    if (this._taskModalActive) {
      if (this._taskModalRefs && this._taskModalRefs.modal && this._taskModalRefs.modal.active) {
        return;
      }
      this.forceReleaseTaskModal();
    }
    this._taskModalActive = true;
    try {
    this.setPlayDialogDockVisible(false);
    this._taskHintShown = false;
    /* Recuerda el estado previo del checklist y lo colapsa mientras dure el modal.
       Solo lo capturamos si NO veníamos de encadenar otra modal (aviso → pregunta). */
    if (this._taskListWasCollapsed == null) {
      this._taskListWasCollapsed = !!this._taskListCollapsed;
    }
    if (this._taskListBg) this.setTaskListCollapsed(true);

    var serif = 'Georgia, "Times New Roman", "Liberation Serif", serif';
    var sans = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    var dockProbe = this.getBottomDialogDock();
    var tight = dockProbe.tight;
    var desk = dockProbe.isDesktopWide;
    var innerW = dockProbe.innerW;
    var padX = dockProbe.padX;
    var isPortraitQ = this.cameras.main.height > this.cameras.main.width;
    var fsQ = desk ? 13 : isPortraitQ ? 15 : tight ? 14 : 15;
    var fsOpt = desk ? 12 : isPortraitQ ? 14 : tight ? 13 : 14;
    var fsHint = desk ? 11 : isPortraitQ ? 12 : 11;
    var minFsQ = desk ? 11 : 11;
    var minFsOpt = desk ? 10 : 11;

    var opts = task.pregunta.opciones || [];
    var useOptGrid = opts.length === 4 && innerW >= 140;
    var optGap = useOptGrid ? 6 : desk ? 4 : 5;
    var optColGap = 8;
    var hintRowH = desk ? 10 : 11;
    var qGap = desk ? 5 : 6;
    var innerPad = desk ? 7 : 8;
    var letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    var viewH = this.cameras.main.height;
    var mb = dockProbe.marginBottom;
    var planeTop = this.getDialogSafeTopY();
    var maxPanelH = Math.max(desk ? 72 : 88, viewH - mb - planeTop);
    var optColW = useOptGrid ? Math.floor((innerW - optColGap) / 2) : innerW;

    function measureOneOpt(label, i, colW) {
      return self.measurePlainOptionHeight(
        letters[i] || String(i + 1),
        label,
        colW != null ? colW : innerW,
        fsOpt,
        sans
      );
    }

    function measureOptsBlock() {
      if (useOptGrid) {
        var h0 = measureOneOpt(opts[0], 0, optColW);
        var h1 = measureOneOpt(opts[1], 1, optColW);
        var h2 = measureOneOpt(opts[2], 2, optColW);
        var h3 = measureOneOpt(opts[3], 3, optColW);
        var row0 = Math.max(h0, h1);
        var row1 = Math.max(h2, h3);
        return {
          heights: [h0, h1, h2, h3],
          total: row0 + optGap + row1,
          grid: true
        };
      }
      var heights = opts.map(function (label, i) {
        return measureOneOpt(label, i, innerW);
      });
      return {
        heights: heights,
        total:
          heights.reduce(function (sum, ht) {
            return sum + ht;
          }, 0) + Math.max(0, opts.length - 1) * optGap,
        grid: false
      };
    }

    function measureQuestionPanelH() {
      var ob = measureOptsBlock();
      var qH = self.measureDialogTextHeight(
        task.pregunta.texto,
        innerW,
        fsQ,
        serif,
        PLAY_DIALOG_LINE_SPACING
      );
      return {
        qH: qH,
        optsBlockH: ob.total,
        panelH:
          dockProbe.bandH +
          innerPad +
          qH +
          qGap +
          ob.total +
          hintRowH +
          innerPad +
          6
      };
    }

    var fit = measureQuestionPanelH();
    var guardFit = 0;
    while (fit.panelH > maxPanelH && guardFit < 20) {
      guardFit += 1;
      if (fsQ > minFsQ) {
        fsQ -= 1;
      } else if (fsOpt > minFsOpt) {
        fsOpt -= 1;
      } else if (optGap > 3) {
        optGap -= 1;
      } else if (innerPad > 5) {
        innerPad -= 1;
      } else {
        break;
      }
      fit = measureQuestionPanelH();
    }

    var maxQH = Math.max(
      22,
      maxPanelH - dockProbe.bandH - fit.optsBlockH - hintRowH - innerPad * 2 - 12
    );
    while (fsQ >= minFsQ && fit.qH > maxQH) {
      fsQ -= 1;
      fit = measureQuestionPanelH();
    }

    var maxFsQ = isPortraitQ ? 16 : desk ? 13 : 14;
    var maxFsOpt = isPortraitQ ? 14 : desk ? 11 : 13;
    var growGuard = 0;
    while (growGuard < 16) {
      growGuard += 1;
      var grew = false;
      fit = measureQuestionPanelH();
      maxQH = Math.max(
        22,
        maxPanelH - dockProbe.bandH - fit.optsBlockH - hintRowH - innerPad * 2 - 12
      );
      if (fsQ < maxFsQ) {
        var qTryH = self.measureDialogTextHeight(
          task.pregunta.texto,
          innerW,
          fsQ + 1,
          serif,
          PLAY_DIALOG_LINE_SPACING
        );
        if (qTryH <= maxQH) {
          fsQ += 1;
          grew = true;
        }
      }
      if (fsOpt < maxFsOpt) {
        var savedOpt = fsOpt;
        fsOpt += 1;
        var tryFit = measureQuestionPanelH();
        if (tryFit.panelH <= maxPanelH) {
          var maxQhTry = Math.max(
            22,
            maxPanelH -
              dockProbe.bandH -
              tryFit.optsBlockH -
              hintRowH -
              innerPad * 2 -
              12
          );
          var qNowH = self.measureDialogTextHeight(
            task.pregunta.texto,
            innerW,
            fsQ,
            serif,
            PLAY_DIALOG_LINE_SPACING
          );
          if (qNowH <= maxQhTry) {
            fit = tryFit;
            grew = true;
          } else {
            fsOpt = savedOpt;
          }
        } else {
          fsOpt = savedOpt;
        }
      }
      if (!grew) break;
    }

    var panelH = maxPanelH;
    var py = planeTop;

    var qTitle =
      task.pregunta && task.pregunta.titulo
        ? task.pregunta.titulo
        : task.desc && task.desc.indexOf('Sir Vectorius') !== -1
          ? '⛰️ Sir Vectorius'
          : 'Tarea ' + (this._taskIndex + 1) + '/' + this.level.tareas.length;
    var shell = this.openBottomDialogShell(qTitle, {
      panelH: panelH,
      py: py,
      compactRadius: desk ? 12 : 14
    });
    this._taskModalRefs = {
      modal: shell.modal,
      hintLbl: null,
      buttons: []
    };
    this._taskMetaLatchIndex = this._taskIndex;
    MissionFlow.missionRuntimeOnDialogOpen(this, task, 'question');
    var depth = shell.depth;
    var px = shell.px;

    var qText = this.add
      .text(px + padX, shell.bodyTop, task.pregunta.texto, {
        fontFamily: serif,
        fontSize: fsQ + 'px',
        color: '#0f172a',
        fontStyle: 'bold',
        align: 'left',
        wordWrap: { width: innerW },
        lineSpacing: PLAY_DIALOG_LINE_SPACING,
        stroke: '#fefce8',
        strokeThickness: 2
      })
      .setOrigin(0, 0);
    shell.modal.add(qText);

    var btnObjs = [];
    var optRowY = qText.y + qText.height + qGap;

    if (useOptGrid) {
      var gridX = px + padX;
      var row0Y = optRowY;
      var h0 = measureOneOpt(opts[0], 0, optColW);
      var h1 = measureOneOpt(opts[1], 1, optColW);
      var row0H = Math.max(h0, h1);
      var row1Y = row0Y + row0H + optGap;
      var gridSlots = [
        { x: gridX, y: row0Y, w: optColW },
        { x: gridX + optColW + optColGap, y: row0Y, w: optColW },
        { x: gridX, y: row1Y, w: optColW },
        { x: gridX + optColW + optColGap, y: row1Y, w: optColW }
      ];
      opts.forEach(function (label, i) {
        var slot = gridSlots[i];
        var card = self.buildPlainOptionRow(
          slot.x,
          slot.y,
          slot.w,
          letters[i] || String(i + 1),
          label,
          fsOpt,
          sans,
          depth + 2
        );
        card.hit.on('pointerdown', function () {
          self.onTaskAnswer(i, task, btnObjs);
        });
        shell.modal.add([card.bg, card.label, card.hit]);
        btnObjs.push(card);
      });
      optRowY = row1Y + Math.max(measureOneOpt(opts[2], 2, optColW), measureOneOpt(opts[3], 3, optColW));
    } else {
      opts.forEach(function (label, i) {
        var card = self.buildPlainOptionRow(
          px + padX,
          optRowY,
          innerW,
          letters[i] || String(i + 1),
          label,
          fsOpt,
          sans,
          depth + 2
        );
        card.hit.on('pointerdown', function () {
          self.onTaskAnswer(i, task, btnObjs);
        });
        shell.modal.add([card.bg, card.label, card.hit]);
        btnObjs.push(card);
        optRowY += card.h + optGap;
      });
    }

    var lastOptBottom = optRowY - optGap;
    if (btnObjs.length) {
      var lastCard = btnObjs[btnObjs.length - 1];
      lastOptBottom = lastCard.topY + lastCard.h;
    }

    var hintLbl = this.add
      .text(shell.titleCx, lastOptBottom + hintRowH * 0.5 + 4, '', {
        fontFamily: sans,
        fontSize: fsHint + 'px',
        color: '#78350f',
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: innerW },
        stroke: '#fffbeb',
        strokeThickness: 2
      })
      .setOrigin(0.5);
    shell.modal.add(hintLbl);

    if (task.pregunta.guiaEjes) {
      this.showQuestionAxisGuides(task.pregunta.guiaEjes);
    } else {
      this.clearQuestionAxisGuides();
    }

    if (!task.pregunta.pista) {
      hintLbl.setVisible(false);
    }

    this._taskModalRefs.hintLbl = hintLbl;
    this._taskModalRefs.buttons = btnObjs;
    } catch (eQuest) {
      console.error('[Caza Tesoro] showTaskQuestion:', eQuest);
      this._taskMetaLatchIndex = -1;
      this.forceReleaseTaskModal();
    }
  };

  GameScene.prototype.measureCompactOptionHeight = function (
    letter,
    label,
    innerW,
    fsOpt,
    family,
    compact
  ) {
    var padY = compact ? 3 : 4;
    var padX = compact ? 8 : 10;
    var wrapW = Math.max(40, innerW - padX * 2);
    var probe = this.add
      .text(0, 0, letter + ') ' + label, {
        fontFamily: family,
        fontSize: fsOpt + 'px',
        color: '#1e3a5f',
        fontStyle: 'bold',
        wordWrap: { width: wrapW },
        lineSpacing: 1
      })
      .setVisible(false);
    var h = Math.max(22, probe.height + padY * 2);
    probe.destroy();
    return h;
  };

  GameScene.prototype.measurePlainOptionHeight = function (letter, label, innerW, fsOpt, family) {
    var padY = 2;
    var wrapW = Math.max(40, innerW - 4);
    var probe = this.add
      .text(0, 0, letter + ') ' + label, {
        fontFamily: family,
        fontSize: fsOpt + 'px',
        color: '#1e3a5f',
        fontStyle: 'bold',
        wordWrap: { width: wrapW },
        lineSpacing: 2
      })
      .setVisible(false);
    var h = Math.max(18, probe.height + padY * 2);
    probe.destroy();
    return h;
  };

  /** Opción legible: solo texto + subrayado al tocar (sin caja ovalada). */
  GameScene.prototype.buildPlainOptionRow = function (x, topY, w, letter, label, fsOpt, family, depth) {
    var padY = 2;
    var wrapW = Math.max(40, w - 4);
    var display = letter + ') ' + label;
    var lbl = this.add
      .text(x + 2, topY + padY, display, {
        fontFamily: family,
        fontSize: fsOpt + 'px',
        color: '#1e3a5f',
        fontStyle: 'bold',
        wordWrap: { width: wrapW },
        lineSpacing: 2
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth + 2);
    var h = Math.max(18, lbl.height + padY * 2);
    var cy = topY + h / 2;
    var cx = x + w / 2;
    var bg = this.add.graphics().setScrollFactor(0).setDepth(depth);
    var hit = this.add
      .zone(cx, cy, w, h)
      .setScrollFactor(0)
      .setDepth(depth + 3)
      .setInteractive({ useHandCursor: true });
    var card = {
      bg: bg,
      chip: null,
      chipText: null,
      label: lbl,
      hit: hit,
      cx: cx,
      cy: cy,
      w: w,
      h: h,
      topY: topY,
      state: 'idle'
    };
    var paint = function (state) {
      card.state = state;
      bg.clear();
      var lblColor = '#1e3a5f';
      if (state === 'correct') {
        bg.fillStyle(0xdcfce7, 0.85);
        bg.fillRect(x, topY, w, h);
        bg.lineStyle(2, 0x15803d, 1);
        bg.lineBetween(x, topY + h - 1, x + w, topY + h - 1);
        lblColor = '#14532d';
      } else if (state === 'wrong') {
        bg.fillStyle(0xfee2e2, 0.85);
        bg.fillRect(x, topY, w, h);
        bg.lineStyle(2, 0xb91c1c, 1);
        bg.lineBetween(x, topY + h - 1, x + w, topY + h - 1);
        lblColor = '#7f1d1d';
      } else if (state === 'hover') {
        bg.lineStyle(2, 0xa67c2e, 0.95);
        bg.lineBetween(x, topY + h - 1, x + w, topY + h - 1);
      }
      lbl.setColor(lblColor);
    };
    paint('idle');
    card.paint = paint;
    hit.on('pointerover', function () {
      if (card.state === 'idle') paint('hover');
    });
    hit.on('pointerout', function () {
      if (card.state === 'hover') paint('idle');
    });
    return card;
  };

  /** Opción en lista con caja redondeada (legacy compacta). */
  GameScene.prototype.buildCompactOptionRow = function (
    x,
    topY,
    w,
    letter,
    label,
    fsOpt,
    family,
    depth,
    fillAlpha,
    compact
  ) {
    var padY = compact ? 3 : 4;
    var padX = compact ? 8 : 10;
    var wrapW = Math.max(40, w - padX * 2);
    var display = letter + ') ' + label;
    var lbl = this.add
      .text(x + padX, topY + padY, display, {
        fontFamily: family,
        fontSize: fsOpt + 'px',
        color: '#1e3a5f',
        fontStyle: 'bold',
        wordWrap: { width: wrapW },
        lineSpacing: 1,
        stroke: '#fefce8',
        strokeThickness: 1
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth + 2);
    var h = Math.max(22, lbl.height + padY * 2);
    var cy = topY + h / 2;
    var cx = x + w / 2;
    var bg = this.add.graphics().setScrollFactor(0).setDepth(depth);
    var hit = this.add
      .zone(cx, cy, w, h)
      .setScrollFactor(0)
      .setDepth(depth + 3)
      .setInteractive({ useHandCursor: true });
    var card = {
      bg: bg,
      chip: null,
      chipText: null,
      label: lbl,
      hit: hit,
      cx: cx,
      cy: cy,
      w: w,
      h: h,
      topY: topY,
      bgFillAlpha: fillAlpha != null ? fillAlpha : 0.95,
      state: 'idle'
    };
    var paint = function (state) {
      card.state = state;
      bg.clear();
      var bgColor, bgBorder, lblColor;
      var fa = card.bgFillAlpha;
      var r = 8;
      if (state === 'correct') {
        bgColor = 0xdcfce7;
        bgBorder = 0x15803d;
        lblColor = '#14532d';
        fa = 1;
      } else if (state === 'wrong') {
        bgColor = 0xfee2e2;
        bgBorder = 0xb91c1c;
        lblColor = '#7f1d1d';
        fa = 1;
      } else if (state === 'hover') {
        bgColor = 0xfff9e8;
        bgBorder = 0xa67c2e;
        lblColor = '#1e3a5f';
        fa = Math.min(1, card.bgFillAlpha + 0.12);
      } else {
        bgColor = 0xfff9e8;
        bgBorder = 0xd4a259;
        lblColor = '#1e3a5f';
        fa = card.bgFillAlpha;
      }
      bg.fillStyle(bgColor, fa);
      bg.fillRoundedRect(x, topY, w, h, r);
      bg.lineStyle(1.5, bgBorder, 0.9);
      bg.strokeRoundedRect(x, topY, w, h, r);
      lbl.setColor(lblColor);
    };
    paint('idle');
    card.paint = paint;
    hit.on('pointerover', function () {
      if (card.state === 'idle') paint('hover');
    });
    hit.on('pointerout', function () {
      if (card.state === 'hover') paint('idle');
    });
    return card;
  };

  /* Tarjeta de opción (legacy): chip + óvalo; reservada por si hace falta en otro HUD. */
  GameScene.prototype.buildOptionCard = function (cx, cy, w, h, letter, label, fsOpt, family, depth, fillAlpha) {
    var chipR = h * 0.34;
    var chipPad = w < 190 ? 4 : 6;
    var chipX = cx - w / 2 + chipR + chipPad;
    var bgAlpha = fillAlpha != null ? fillAlpha : 1;

    var bg = this.add.graphics().setScrollFactor(0).setDepth(depth);
    var chip = this.add.graphics().setScrollFactor(0).setDepth(depth + 1);
    var chipText = this.add
      .text(chipX, cy, letter, {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: Math.round(chipR * 1.1) + 'px',
        color: '#fff9e8',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setDepth(depth + 2);
    var lbl = this.add
      .text(chipX + chipR + 8, cy, label, {
        fontFamily: family,
        fontSize: fsOpt + 'px',
        color: '#1e3a5f',
        fontStyle: 'bold',
        wordWrap: { width: w - (chipR * 2 + 22) },
        align: 'left',
        stroke: '#fefce8',
        strokeThickness: 2
      })
      .setOrigin(0, 0.5)
      .setDepth(depth + 2);
    var hit = this.add
      .zone(cx, cy, w, h)
      .setScrollFactor(0)
      .setDepth(depth + 3)
      .setInteractive({ useHandCursor: true });

    var card = {
      bg: bg, chip: chip, chipText: chipText, label: lbl, hit: hit,
      cx: cx, cy: cy, w: w, h: h, chipX: chipX, chipR: chipR,
      state: 'idle',
      bgFillAlpha: bgAlpha
    };

    var paint = function (state) {
      card.state = state;
      bg.clear();
      chip.clear();
      var bgColor, bgBorder, chipColor, chipBorder, lblColor;
      var fa = card.bgFillAlpha;
      if (state === 'correct') {
        bgColor = 0xdcfce7;
        bgBorder = 0x15803d;
        chipColor = 0x15803d;
        chipBorder = 0x14532d;
        lblColor = '#14532d';
        fa = 1;
      } else if (state === 'wrong') {
        bgColor = 0xfee2e2;
        bgBorder = 0xb91c1c;
        chipColor = 0xb91c1c;
        chipBorder = 0x7f1d1d;
        lblColor = '#7f1d1d';
        fa = 1;
      } else if (state === 'hover') {
        bgColor = 0xfff9e8;
        bgBorder = 0xa67c2e;
        chipColor = 0x1e3a5f;
        chipBorder = 0xd4a259;
        lblColor = '#1e3a5f';
        fa = Math.min(1, card.bgFillAlpha + 0.18);
      } else {
        bgColor = 0xfff9e8;
        bgBorder = 0xd4a259;
        chipColor = 0xd4a259;
        chipBorder = 0xa67c2e;
        lblColor = '#1e3a5f';
        fa = card.bgFillAlpha;
      }
      bg.fillStyle(bgColor, fa);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
      bg.lineStyle(2, bgBorder, 0.92);
      bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
      chip.fillStyle(chipColor, 1);
      chip.fillCircle(card.chipX, cy, chipR);
      chip.lineStyle(1.5, chipBorder, 0.9);
      chip.strokeCircle(card.chipX, cy, chipR);
      lbl.setColor(lblColor);
    };
    paint('idle');
    card.paint = paint;

    hit.on('pointerover', function () {
      if (card.state === 'idle') paint('hover');
    });
    hit.on('pointerout', function () {
      if (card.state === 'hover') paint('idle');
    });

    return card;
  };

  /* Aviso en la caja inferior fija (mismo panel que las preguntas). */
  GameScene.prototype.showTaskNotice = function (task, opts) {
    var self = this;
    this._taskChainingModal = false;
    this._taskChainingSince = 0;
    /* Si la magia ya hizo efecto (Secuaz fuera del mapa), no repetir el panel. */
    if (
      task &&
      this.taskIsMontanasMagiaContraSecuaz(task) &&
      !this.levelHasSecuazMadEn(-7, 5)
    ) {
      var skipNext = (this.level.tareas || [])[this._taskIndex + 1] || null;
      var skipChain = !!(task.encadenarSiguiente && skipNext);
      this.time.delayedCall(0, function () {
        if (!self.sys || !self.sys.isActive()) return;
        self.advanceTaskAfterComplete({
          chainNext: skipChain,
          nextTask: skipNext,
          completedTask: task
        });
      });
      return;
    }
    this.reconcileTaskModalState();
    if (this._taskModalActive) {
      if (this._taskModalRefs && this._taskModalRefs.modal && this._taskModalRefs.modal.active) {
        return;
      }
      this.forceReleaseTaskModal();
    }
    this._taskModalActive = true;
    try {
    this.setPlayDialogDockVisible(false);
    if (this._taskListWasCollapsed == null) {
      this._taskListWasCollapsed = !!this._taskListCollapsed;
    }
    if (this._taskListBg) this.setTaskListCollapsed(true);
    var customDismiss = opts && typeof opts.onDismiss === 'function' ? opts.onDismiss : null;

    var serif = 'Georgia, "Times New Roman", "Liberation Serif", serif';
    var sans = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    var avisoTitulo = (task.aviso && task.aviso.titulo) || '✨ Misión';
    var avisoTexto = (task.aviso && task.aviso.texto) || task.desc || '';
    var avisoPaginas =
      task.aviso && task.aviso.paginas && task.aviso.paginas.length
        ? task.aviso.paginas.slice()
        : null;
    var dockProbe = this.getBottomDialogDock();
    var tight = dockProbe.tight;
    var desk = dockProbe.isDesktopWide;
    var innerW = dockProbe.innerW;
    var padX = dockProbe.padX;
    var isPortraitN = this.cameras.main.height > this.cameras.main.width;
    var fsBody = desk ? 13 : isPortraitN ? 15 : tight ? 14 : 15;
    var fsBtn = desk ? 12 : isPortraitN ? 14 : tight ? 13 : 14;
    var minFsBody = desk ? 11 : 11;
    var btnH = desk ? fsBtn + 8 : fsBtn + 10;
    var textToBtnGap = desk ? 12 : 16;
    var btnBottomPad = desk ? 14 : 16;
    var btnReserve = btnH + textToBtnGap + btnBottomPad + 6;
    var noticeLayout = this.layoutPlayBottomPanel({ minH: desk ? 64 : 78 });
    var maxNoticePanelH = noticeLayout.maxContentH;
    var maxBodyTextH = Math.max(32, maxNoticePanelH - dockProbe.bandH - btnReserve - 12);
    var pages = null;

    if (avisoPaginas) {
      pages = [];
      for (var ap = 0; ap < avisoPaginas.length; ap++) {
        var parts = this.paginateDialogText(
          avisoPaginas[ap],
          innerW,
          fsBody,
          maxBodyTextH,
          serif,
          PLAY_DIALOG_LINE_SPACING
        );
        for (var pp = 0; pp < parts.length; pp++) pages.push(parts[pp]);
      }
    } else {
      while (fsBody >= minFsBody) {
        var singleH = this.measureDialogTextHeight(
          avisoTexto,
          innerW,
          fsBody,
          serif,
          PLAY_DIALOG_LINE_SPACING
        );
        if (singleH <= maxBodyTextH) {
          pages = [avisoTexto];
          break;
        }
        fsBody -= 1;
      }
      if (!pages) {
        fsBody = Math.max(minFsBody, fsBody);
        pages = this.paginateDialogText(
          avisoTexto,
          innerW,
          fsBody,
          maxBodyTextH,
          serif,
          PLAY_DIALOG_LINE_SPACING
        );
      }
    }
    if (!pages || !pages.length) {
      throw new Error('Aviso sin texto (pages vacío)');
    }
    if (pages.length === 1) {
      fsBody = this.fitDialogFontSize(
        pages[0],
        innerW,
        fsBody,
        isPortraitN ? 18 : desk ? 15 : 16,
        maxBodyTextH,
        serif,
        PLAY_DIALOG_LINE_SPACING
      );
    }
    var pageH = this.measureDialogTextHeight(
      pages[0],
      innerW,
      fsBody,
      serif,
      PLAY_DIALOG_LINE_SPACING
    );
    for (var pi = 1; pi < pages.length; pi++) {
      pageH = Math.max(
        pageH,
        this.measureDialogTextHeight(pages[pi], innerW, fsBody, serif, PLAY_DIALOG_LINE_SPACING)
      );
    }
    var panelH =
      dockProbe.bandH +
      8 +
      pageH +
      (pages.length > 1 ? 10 : 0) +
      textToBtnGap +
      btnH +
      btnBottomPad +
      4;
    panelH = Phaser.Math.Clamp(panelH, 64, noticeLayout.panelH);
    var pyNotice = noticeLayout.py;

    var shell = this.openBottomDialogShell(avisoTitulo, {
      panelH: panelH,
      py: pyNotice,
      compactRadius: desk ? 12 : 14
    });
    /* En cuanto hay modal, registrar refs y latch: si no, otro maybePrompt/tick puede
       ver _taskModalActive sin refs, llamar forceRelease y reabrir el mismo aviso
       (p. ej. sombrero justo tras cerrar Sabiondo en (−3, 4)). */
    this._taskModalRefs = {
      modal: shell.modal,
      buttons: []
    };
    this._taskMetaLatchIndex = this._taskIndex;
    MissionFlow.missionRuntimeOnDialogOpen(this, task, 'notice');
    var depth = shell.depth;
    var px = shell.px;
    var pageIndex = 0;

    var bodyText = this.add
      .text(px + padX, shell.bodyTop, pages[0], {
        fontFamily: serif,
        fontSize: fsBody + 'px',
        color: '#0f172a',
        fontStyle: 'bold',
        align: 'left',
        wordWrap: { width: innerW },
        lineSpacing: PLAY_DIALOG_LINE_SPACING,
        stroke: '#fefce8',
        strokeThickness: 2
      })
      .setOrigin(0, 0);
    shell.modal.add(bodyText);

    var btnCx = shell.titleCx;
    var btnCy = 0;
    var labelBase = (task.aviso && task.aviso.botonLabel) || '¡Entendido!';
    var btnBg = this.add.graphics();
    var btnW = Math.min(innerW * 0.92, shell.panelW - padX * 2);
    var rb = btnH / 2;
    var btnMaxCy = shell.py + shell.panelH - btnBottomPad - btnH / 2;
    var noticeTextMaxBottom = btnMaxCy - btnH / 2 - textToBtnGap;
    var noticeTextMaxH = Math.max(28, noticeTextMaxBottom - shell.bodyTop);

    function positionNoticeButton() {
      btnCy = btnMaxCy;
      if (btnText && btnText.active) btnText.setY(btnCy);
      if (btnHit && btnHit.active) btnHit.setPosition(btnCx, btnCy);
      paintBtn();
      if (pageLbl && pageLbl.active) {
        pageLbl.setY(btnCy - btnH / 2 - 10);
      }
    }

    function paintBtn() {
      btnBg.clear();
      btnBg.fillGradientStyle(0x22c55e, 0x22c55e, 0x15803d, 0x15803d, 1, 1, 1, 1);
      btnBg.fillRoundedRect(btnCx - btnW / 2, btnCy - btnH / 2, btnW, btnH, rb);
      btnBg.lineStyle(2, 0x064e2a, 0.9);
      btnBg.strokeRoundedRect(btnCx - btnW / 2, btnCy - btnH / 2, btnW, btnH, rb);
    }
    btnBg.setDepth(depth + 2);
    shell.modal.add(btnBg);

    var btnLabel = function () {
      if (pages.length > 1 && pageIndex < pages.length - 1) return 'Continuar ›';
      return labelBase;
    };
    var btnText = this.add
      .text(btnCx, btnCy, btnLabel(), {
        fontFamily: sans,
        fontSize: fsBtn + 'px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#052e16',
        strokeThickness: 2
      })
      .setOrigin(0.5)
      .setDepth(depth + 3);
    shell.modal.add(btnText);
    var btnHit = this.add
      .zone(btnCx, btnCy, btnW, btnH)
      .setScrollFactor(0)
      .setDepth(depth + 4)
      .setInteractive({ useHandCursor: true });
    shell.modal.add(btnHit);

    var pageLbl = null;
    if (pages.length > 1) {
      pageLbl = this.add
        .text(shell.titleCx, btnMaxCy - btnH / 2 - 10, '1 / ' + pages.length, {
          fontFamily: sans,
          fontSize: (tight ? 9 : 10) + 'px',
          color: '#78350f',
          fontStyle: 'italic'
        })
        .setOrigin(0.5, 1);
      shell.modal.add(pageLbl);
    }

    var finishNotice = function () {
      if (shell.modal && shell.modal.getData && shell.modal.getData('ctcNoticeFinished')) return;
      if (shell.modal && shell.modal.setData) shell.modal.setData('ctcNoticeFinished', true);
      if (customDismiss) {
        customDismiss();
        return;
      }
      if (task.pregunta) {
        self._taskChainingModal = true;
        self._taskChainingSince = self.time ? self.time.now : 0;
        self.closeTaskModal({ skipRestoreChecklist: true, instant: true });
        self._taskModalActive = false;
        self._taskModalRefs = null;
        self.time.delayedCall(80, function () {
          if (!self.sys || !self.sys.isActive()) return;
          self.showTaskQuestion(task);
        });
        return;
      }
      self._taskNoticeAdvanceScheduled = true;
      var nextTask = (self.level.tareas || [])[self._taskIndex + 1] || null;
      var chainNext = !!(task.encadenarSiguiente && nextTask);
      var chainOpensNow = chainNext && self.shouldAutoOpenChainedTask(nextTask);
      if (chainOpensNow) {
        self._taskChainingModal = true;
        self._taskChainingSince = self.time ? self.time.now : 0;
      }
      self.closeTaskModal({
        skipRestoreChecklist: chainOpensNow,
        deferMetaRefresh: !!task.accion
      });
      var bumpArmed = { done: false };
      var bumpTaskAndAdvance = function () {
        if (bumpArmed.done) return;
        bumpArmed.done = true;
        self.advanceTaskAfterComplete({
          chainNext: chainNext,
          nextTask: nextTask,
          completedTask: task
        });
      };
      if (task.accion) {
        if (
          self.taskIsMontanasMagiaContraSecuaz(task) &&
          !self.levelHasSecuazMadEn(-7, 5)
        ) {
          bumpTaskAndAdvance();
        } else {
          self.runTaskActions(task.accion, bumpTaskAndAdvance);
        }
      } else {
        bumpTaskAndAdvance();
      }
    };

    var relayoutNoticeBody = function () {
      var slice = pages[pageIndex];
      var tryFs = fsBody;
      bodyText.setText(slice);
      while (tryFs >= minFsBody) {
        bodyText.setFontSize(tryFs + 'px');
        bodyText.setText(slice);
        if (bodyText.height <= noticeTextMaxH) break;
        tryFs -= 1;
      }
      positionNoticeButton();
    };

    relayoutNoticeBody();

    function maybeSyncSecuazFogForPage(pi) {
      if (!self.level || self.level.id !== 2 || self._taskIndex < 8 || self._taskIndex > 13) return;
      if (self._secuazFogDispelled) return;
      var nieblaPage = task.aviso && task.aviso.nieblaEnPagina;
      if (nieblaPage != null && pi === nieblaPage) self.syncSecuazFog();
    }
    function playSonidoPaginaIfAny(pi) {
      var sndPage = task.aviso && task.aviso.sonidoPagina;
      if (sndPage && sndPage.enPagina === pi && sndPage.sonido) {
        try {
          self.playAvisoSound(sndPage.sonido, {
            repeticiones:
              sndPage.sonidoRepeticiones != null ? sndPage.sonidoRepeticiones : 1,
            gapMs: sndPage.sonidoGapMs
          });
        } catch (eSndPg) {}
      }
    }
    maybeSyncSecuazFogForPage(pageIndex);
    playSonidoPaginaIfAny(pageIndex);

    if (task.aviso && task.aviso.dispersarNiebla && !self._secuazFogDispelled) {
      self.time.delayedCall(280, function () {
        if (!self.sys || !self.sys.isActive()) return;
        self.startSecuazFogDispel({ lento: true });
      });
    }

    btnHit.on('pointerdown', function () {
      if (pages.length > 1 && pageIndex < pages.length - 1) {
        pageIndex += 1;
        var cambio = task.aviso && task.aviso.cambioSprite;
        if (cambio && cambio.enPagina === pageIndex) {
          self.runAvisoSpriteChange(cambio, task);
        }
        maybeSyncSecuazFogForPage(pageIndex);
        playSonidoPaginaIfAny(pageIndex);
        relayoutNoticeBody();
        btnText.setText(btnLabel());
        if (pageLbl && pageLbl.active) pageLbl.setText(pageIndex + 1 + ' / ' + pages.length);
        return;
      }
      finishNotice();
    });

    var soundId = task && task.aviso && task.aviso.sonido;
    var soundReps =
      task && task.aviso && task.aviso.sonidoRepeticiones != null
        ? task.aviso.sonidoRepeticiones
        : 1;
    if (soundId) {
      try {
        this.playAvisoSound(soundId, { repeticiones: soundReps });
      } catch (eSnd) {}
    }

    } catch (eNotice) {
      console.error('[Caza Tesoro] showTaskNotice:', eNotice);
      this._taskMetaLatchIndex = -1;
      this.forceReleaseTaskModal();
    }
  };

  /** MP3 de aviso (p. ej. mosca ×3 al llegar con Sabiondo). */
  GameScene.prototype.playAvisoMp3 = function (cacheKey, times, gapMs, volume) {
    times = Math.max(1, times || 1);
    gapMs = gapMs != null ? gapMs : 90;
    if (!this.sound || isGameSoundMuted(this)) return;
    if (!this.cache || !this.cache.audio || !this.cache.audio.exists(cacheKey)) return;
    var self = this;
    var played = 0;
    function playOne() {
      if (!self.sys || !self.sys.isActive()) return;
      if (played >= times) return;
      played += 1;
      try {
        var sfx = self.sound.add(cacheKey, { volume: volume != null ? volume : 0.85 });
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          try {
            sfx.destroy();
          } catch (eD) {}
          if (played < times) self.time.delayedCall(gapMs, playOne);
        }
        sfx.once('complete', finish);
        sfx.once('stop', finish);
        sfx.play();
      } catch (eP) {
        if (played < times) self.time.delayedCall(gapMs, playOne);
      }
    }
    playOne();
  };

  /* Reproduce un sonido de aviso: MP3 del juego o tonos sintetizados (Web Audio).
     IDs MP3: mosca_aviso / mosca_muerta. Sintéticos: cronometro, ding, alerta. */
  GameScene.prototype.playAvisoSound = function (id, opts) {
    opts = opts || {};
    if (!this.sound || isGameSoundMuted(this)) return;
    var mp3Map = {
      mosca_aviso: 'moscaAviso',
      mosca_muerta: 'moscaMuerta',
      moscaAviso: 'moscaAviso',
      moscaMuerta: 'moscaMuerta',
      ladrido_perro: 'ladridoPerro',
      ladridoPerro: 'ladridoPerro',
      enjambre_de_moscas: 'enjambreMoscas',
      enjambre_moscas: 'enjambreMoscas',
      enjambreMoscas: 'enjambreMoscas'
    };
    var cacheKey = mp3Map[id];
    if (cacheKey) {
      var vol =
        cacheKey === 'moscaMuerta'
          ? 0.9
          : cacheKey === 'ladridoPerro'
            ? 0.78
            : cacheKey === 'enjambreMoscas'
              ? 0.8
              : 0.82;
      this.playAvisoMp3(cacheKey, opts.repeticiones || 1, opts.gapMs, vol);
      return;
    }
    var ctx = this.sound.context;
    if (!ctx || typeof ctx.createOscillator !== 'function') return;
    var now = ctx.currentTime;

    function tone(freq, startOff, durMs, type, gainPeak) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now + startOff);
      var peak = gainPeak != null ? gainPeak : 0.18;
      gain.gain.setValueAtTime(0.0001, now + startOff);
      gain.gain.exponentialRampToValueAtTime(peak, now + startOff + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOff + durMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOff);
      osc.stop(now + startOff + durMs / 1000 + 0.02);
    }

    if (id === 'cronometro' || id === 'reloj') {
      tone(1800, 0.00, 70, 'square', 0.12);
      tone(1800, 0.18, 70, 'square', 0.12);
      tone(1200, 0.40, 160, 'square', 0.14);
    } else if (id === 'ding') {
      tone(1320, 0.00, 220, 'sine', 0.22);
      tone(1760, 0.18, 280, 'sine', 0.20);
    } else if (id === 'alerta') {
      tone(880, 0.00, 180, 'triangle', 0.22);
      tone(660, 0.18, 220, 'triangle', 0.22);
    }
  };

  /** Pasos Manhattan desde la posición actual siguiendo una lista de waypoints. */
  GameScene.prototype.calcPasosManhattanRuta = function (waypoints, extra) {
    if (!waypoints || !waypoints.length) return 16;
    var x = this.pos.x;
    var y = this.pos.y;
    var total = 0;
    for (var i = 0; i < waypoints.length; i++) {
      var w = waypoints[i];
      total += Math.abs(w.x - x) + Math.abs(w.y - y);
      x = w.x;
      y = w.y;
    }
    var pad = extra != null ? extra : 0;
    return Math.max(1, total + pad);
  };

  /* Activa el conteo de pasos: deja N como movimientos restantes.
     Animación: el HUD pulsa y queda visible. */
  GameScene.prototype.iniciarLimitePasos = function (pasos) {
    if (!pasos || pasos <= 0) pasos = 16;
    /* Bandera de escena (no muta level.* para que reiniciar funcione bien). */
    this._limiteActivo = true;
    this._maxMovimientosVigente = pasos;
    this.movimientosRestantes = pasos;
    this.__movRestantes = pasos;
    UI.mostrarCoordenadas(this, this.pos.x, this.pos.y);
    if (this.__coordHudText && this.__coordHudText.active) {
      try { Anim.animPop(this, this.__coordHudText); } catch (e) {}
    }
    var compactHud = this.cameras.main.width < 520 || this.cameras.main.height < 560;
    UI.mostrarMensaje(
      this,
      '¡Sir cuenta tus pasos! Tienes ' + pasos + ' movimientos hasta el cofre.',
      {
        fontSize: compactHud ? 12 : 14,
        padding: { x: compactHud ? 9 : 11, y: compactHud ? 6 : 7 },
        holdMs: compactHud ? 2800 : 3200
      }
    );
    /* Flash y mini-shake para enfatizar el cambio de regla. */
    if (this.cameras && this.cameras.main) {
      try { this.cameras.main.flash(160, 250, 230, 180); } catch (e2) {}
    }
    var selfIl = this;
    this.time.delayedCall(45, function () {
      if (!selfIl.sys || !selfIl.sys.isActive()) return;
      if (typeof selfIl.showMetaMarker === 'function') selfIl.showMetaMarker();
    });
  };

  GameScene.prototype.onTaskAnswer = function (idx, task, btnObjs) {
    var self = this;
    var refs = this._taskModalRefs;
    if (!refs) return;
    var hintLbl = refs.hintLbl;
    var rules = window.SCORE_RULES || {};
    var correcta = task.pregunta.correcta;
    var esCorrecta = idx === correcta;

    if (esCorrecta) {
      var exitoSound = task.sonidoExito;
      if (exitoSound) {
        try {
          this.playAvisoSound(exitoSound, {
            repeticiones:
              task.sonidoExitoRepeticiones != null ? task.sonidoExitoRepeticiones : 1,
            gapMs: task.sonidoExitoGapMs != null ? task.sonidoExitoGapMs : 120
          });
        } catch (eExS) {}
      }
      btnObjs.forEach(function (b, i) {
        b.hit.disableInteractive();
        if (i === correcta) b.paint('correct');
      });
      var ganado = this._taskHintShown
        ? (rules.preguntaCorrectaConPista != null ? rules.preguntaCorrectaConPista : 5)
        : (rules.preguntaCorrectaPrimera != null ? rules.preguntaCorrectaPrimera : 10);
      var totalPrev = this.registry.get('starsTotal');
      if (totalPrev == null) totalPrev = 0;
      this.registry.set('starsTotal', totalPrev + ganado);
      var perLevel = this.registry.get('starsPerLevel') || {};
      perLevel[this.levelIndex] = (perLevel[this.levelIndex] || 0) + ganado;
      this.registry.set('starsPerLevel', perLevel);
      if (this.__starsHud && this.__starsHud.active) {
        this.__starsHud.setText('⭐ ' + (totalPrev + ganado));
        Anim.animPop(this, this.__starsHud);
      }
      if (hintLbl && hintLbl.active) {
        hintLbl.setText('¡Muy bien!  +' + ganado + ' ⭐');
        hintLbl.setColor('#15803d');
      }
      this.time.delayedCall(900, function () {
        var ac = task.accion;
        /* Encadenado: cuando la tarea actual pide pasar directo a la siguiente
           pregunta sin esperar a que el jugador se mueva (típico de NPCs
           que hacen varias preguntas seguidas). */
        var nextTask = (self.level.tareas || [])[self._taskIndex + 1] || null;
        var chainNext = !!(task.encadenarSiguiente && nextTask);
        var chainOpensNow = chainNext && self.shouldAutoOpenChainedTask(nextTask);
        if (chainOpensNow) {
          self._taskChainingModal = true;
          self._taskChainingSince = self.time ? self.time.now : 0;
        }
        var defer = self.actionsHaveCinematic(ac);
        var holdChecklist = defer || chainOpensNow;
        self._taskNoticeAdvanceScheduled = true;
        self.closeTaskModal({
          skipRestoreChecklist: holdChecklist,
          instant: true,
          deferMetaRefresh: !!ac
        });

        var bumpArmed = { done: false };
        var bumpTaskAndAdvance = function () {
          if (bumpArmed.done) return;
          bumpArmed.done = true;
          if (defer && self._taskListBg && self._taskListPendingRestore) {
            self.setTaskListCollapsed(false);
          }
          self._taskListPendingRestore = false;
          self._taskListWasCollapsed = null;
          self.advanceTaskAfterComplete({
            chainNext: chainNext,
            nextTask: nextTask,
            completedTask: task
          });
        };

        var doActions = function () {
          if (ac) self.runTaskActions(ac, bumpTaskAndAdvance);
          else bumpTaskAndAdvance();
        };
        if (task.avisoExito) {
          self.time.delayedCall(180, function () {
            self.showTaskNotice(
              { desc: task.desc, meta: task.meta, aviso: task.avisoExito },
              {
                onDismiss: function () {
                  self.closeTaskModal({ skipRestoreChecklist: true });
                  self.time.delayedCall(140, doActions);
                }
              }
            );
          });
        } else {
          doActions();
        }
      });
    } else {
      var card = btnObjs[idx];
      card.paint('wrong');
      card.hit.disableInteractive();
      if (hintLbl && hintLbl.active && task.pregunta.pista) {
        if (!this._taskHintShown) {
          this._taskHintShown = true;
          hintLbl.setVisible(true);
          hintLbl.setText('💡 Pista: ' + task.pregunta.pista);
        } else {
          hintLbl.setText('Sigue intentando · ' + task.pregunta.pista);
        }
        hintLbl.setColor('#92400e');
      }
    }
  };

  /* Normaliza accion (objeto único o array) a un array.
     Acepta null/undefined → []. */
  GameScene.prototype.normalizeActions = function (ac) {
    if (!ac) return [];
    if (Array.isArray(ac)) return ac.filter(function (a) { return !!a; });
    return [ac];
  };

  /* ¿Alguna de las acciones es cinemática? (define si oculta el checklist). */
  GameScene.prototype.actionsHaveCinematic = function (ac) {
    var arr = this.normalizeActions(ac);
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i].tipo;
      if (t === 'explotarObjeto' || t === 'volarObjeto' || t === 'retirarObjeto') return true;
    }
    return false;
  };

  /* Ejecuta una o varias acciones en secuencia y llama onDone al final. */
  GameScene.prototype.runTaskActions = function (ac, onDone) {
    var self = this;
    var arr = this.normalizeActions(ac);
    if (!arr.length) {
      if (onDone) onDone();
      return;
    }
    var hasMontanasMagia =
      this.level &&
      this.level.id === 2 &&
      arr.some(function (s) {
        return s && s.tipo === 'magiaFlash';
      });
    if (hasMontanasMagia) {
      if (this._magiaSecuazCinematicRunning) {
        return;
      }
      this._magiaSecuazCinematicRunning = true;
    }
    if (this._taskActionsRunning) {
      return;
    }
    this._taskActionsRunning = true;
    var i = 0;
    var onDoneFired = false;
    var finishRun = function () {
      self._taskActionsRunning = false;
      if (hasMontanasMagia) self._magiaSecuazCinematicRunning = false;
      if (onDone && !onDoneFired) {
        onDoneFired = true;
        onDone();
      }
    };
    var next = function () {
      if (i >= arr.length) {
        finishRun();
        return;
      }
      var step = arr[i++];
      var t = step.tipo;
      if (t === 'explotarObjeto') {
        self.explotarObjetoEn(step.x, step.y, step.tipos || null, next);
      } else if (t === 'volarObjeto') {
        self.volarObjetoEn(step.x, step.y, step.tipos || null, next);
      } else if (t === 'retirarObjeto') {
        self.retirarObjetoEn(step.x, step.y, step.tipos || null, next);
      } else if (t === 'iniciarLimitePasos') {
        var nPasos = step.pasos;
        if (step.ruta && step.ruta.length) {
          nPasos = self.calcPasosManhattanRuta(step.ruta, step.extra);
        }
        self.iniciarLimitePasos(nPasos);
        next();
      } else if (t === 'magiaFlash') {
        if (typeof self.forceDispelSecuazFog === 'function') self.forceDispelSecuazFog();
        if (self.cameras && self.cameras.main) {
          try {
            self.cameras.main.flash(380, 210, 235, 255);
            self.cameras.main.shake(260, 0.007);
          } catch (eMf) {}
        }
        self.time.delayedCall(220, next);
      } else if (t === 'dispelNieblaSecuaz') {
        if (typeof self.forceDispelSecuazFog === 'function') {
          self.forceDispelSecuazFog();
        } else if (typeof self.startSecuazFogDispel === 'function') {
          self.startSecuazFogDispel({ instant: true, lento: !!step.lento });
        }
        next();
      } else {
        next();
      }
    };
    next();
  };

  /** Victoria: 05_level_completed.mp3; onDone al terminar el clip (o cofre.wav). */
  function playLevelCompletedSound(scene, onDone) {
    onDone = typeof onDone === 'function' ? onDone : function () {};
    if (!scene || !scene.sound || scene.sound.mute) {
      onDone();
      return null;
    }
    var ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      onDone();
    }
    if (scene.cache && scene.cache.audio && scene.cache.audio.exists('levelCompleted')) {
      try {
        var sfx = scene.sound.add('levelCompleted', { volume: 0.9 });
        sfx.once('complete', finish);
        sfx.once('stop', finish);
        sfx.play();
        var durSec = sfx.duration;
        if (!durSec || durSec < 0.15) durSec = sfx.totalDuration || 0;
        var waitMs = durSec > 0.15 ? Math.ceil(durSec * 1000) + 120 : 2200;
        if (scene.time) scene.time.delayedCall(waitMs, finish);
        return sfx;
      } catch (eLc) {}
    }
    if (Logic.isAudioUsable(Logic.audioTreasure)) {
      try {
        Logic.playAudioSafe(Logic.audioTreasure);
        if (scene.time) {
          scene.time.delayedCall(1100, finish);
          return null;
        }
      } catch (eT) {}
    }
    finish();
    return null;
  }

  /** Pantalla de victoria: music_swing-triunfo.mp3 en bucle hasta salir de la escena. */
  function stopVictoryScreenMusic(scene) {
    var g = scene && scene.game;
    var sfx = scene && scene._victoryLoopSfx;
    if (!sfx && g && g.registry) sfx = g.registry.get('victoryLoopSfx');
    if (sfx) {
      try {
        if (sfx.isPlaying) sfx.stop();
        sfx.destroy();
      } catch (eS) {}
    }
    if (scene) scene._victoryLoopSfx = null;
    if (g && g.registry) {
      try {
        g.registry.remove('victoryLoopSfx');
      } catch (eR) {
        g.registry.set('victoryLoopSfx', null);
      }
    }
  }

  function playVictoryScreenMusic(scene) {
    stopVictoryScreenMusic(scene);
    if (!scene || !scene.sound || scene.sound.mute) return null;
    if (!scene.cache || !scene.cache.audio || !scene.cache.audio.exists('victorySwing')) {
      return null;
    }
    try {
      var sfx = scene.sound.add('victorySwing', { volume: 0.72, loop: true });
      sfx.play();
      scene._victoryLoopSfx = sfx;
      if (scene.game && scene.game.registry) {
        scene.game.registry.set('victoryLoopSfx', sfx);
      }
      return sfx;
    } catch (eVi) {}
    return null;
  }

  function wrapVictoryButtonAction(scene, action) {
    return function () {
      stopVictoryScreenMusic(scene);
      if (typeof action === 'function') action();
    };
  }

  /** Pantalla de derrota: 17_the_ending.mp3 en bucle hasta pulsar un botón. */
  function stopDefeatScreenMusic(scene) {
    var g = scene && scene.game;
    var sfx = scene && scene._defeatLoopSfx;
    if (!sfx && g && g.registry) sfx = g.registry.get('defeatLoopSfx');
    if (sfx) {
      try {
        if (sfx.isPlaying) sfx.stop();
        sfx.destroy();
      } catch (eS) {}
    }
    if (scene) scene._defeatLoopSfx = null;
    if (g && g.registry) {
      try {
        g.registry.remove('defeatLoopSfx');
      } catch (eR) {
        g.registry.set('defeatLoopSfx', null);
      }
    }
  }

  function playDefeatScreenMusic(scene) {
    stopDefeatScreenMusic(scene);
    if (!scene || !scene.sound || scene.sound.mute) return null;
    if (!scene.cache || !scene.cache.audio || !scene.cache.audio.exists('defeatEnding')) {
      return null;
    }
    try {
      var sfx = scene.sound.add('defeatEnding', { volume: 0.78, loop: true });
      sfx.play();
      scene._defeatLoopSfx = sfx;
      if (scene.game && scene.game.registry) {
        scene.game.registry.set('defeatLoopSfx', sfx);
      }
      return sfx;
    } catch (eDe) {}
    return null;
  }

  function wrapDefeatButtonAction(scene, action) {
    return function () {
      stopDefeatScreenMusic(scene);
      if (typeof action === 'function') action();
    };
  }

  /** Derrota: solo 19_game_over.mp3; onDone al terminar el clip (o fallback). */
  function playGameOverSound(scene, onDone) {
    onDone = typeof onDone === 'function' ? onDone : function () {};
    if (!scene || !scene.sound || scene.sound.mute) {
      onDone();
      return null;
    }
    var ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      onDone();
    }
    if (scene.cache && scene.cache.audio && scene.cache.audio.exists('gameOver')) {
      try {
        var sfx = scene.sound.add('gameOver', { volume: 0.88 });
        sfx.once('complete', finish);
        sfx.once('stop', finish);
        sfx.play();
        var durSec = sfx.duration;
        if (!durSec || durSec < 0.15) durSec = sfx.totalDuration || 0;
        var waitMs = durSec > 0.15 ? Math.ceil(durSec * 1000) + 120 : 2600;
        if (scene.time) scene.time.delayedCall(waitMs, finish);
        return sfx;
      } catch (eGo) {}
    }
    if (Logic.isAudioUsable(Logic.audioWrong)) {
      try {
        Logic.playAudioSafe(Logic.audioWrong);
        if (scene.time) {
          scene.time.delayedCall(900, finish);
          return null;
        }
      } catch (eW) {}
    }
    finish();
    return null;
  }

  /** Explosión de bomba: Kaboom.mp3 si está cargado; si no, wrong.wav (por defecto). */
  GameScene.prototype.playExplosionSound = function () {
    if (this.sound && !this.sound.mute && this.cache && this.cache.audio && this.cache.audio.exists('kaboom')) {
      try {
        this.sound.play('kaboom', { volume: 0.8 });
        return;
      } catch (eKab) {}
    }
    if (Logic.isAudioUsable(Logic.audioWrong)) {
      try {
        Logic.playAudioSafe(Logic.audioWrong);
      } catch (eA) {}
    }
  };

  /** Bombeitor al irse: Sfx_51.mp3; si no carga, Kaboom.mp3 (y luego wrong.wav). */
  GameScene.prototype.playBombeitorExitSound = function () {
    if (this.sound && !this.sound.mute && this.cache && this.cache.audio && this.cache.audio.exists('bombeitorExit')) {
      try {
        this.sound.play('bombeitorExit', { volume: 0.85 });
        return;
      } catch (eBx) {}
    }
    this.playExplosionSound();
  };

  /* Efecto: hace explotar uno o varios obstáculos en una casilla.
     - Quita sus sprites con un pop y partículas.
     - Los borra de level.objetos para que ya no bloqueen el paso.
     - tipos: lista opcional de tipos a remover (si está vacía, remueve todos). */
  GameScene.prototype.explotarObjetoEn = function (gx, gy, tipos, onDone) {
    var self = this;
    var c = this.gridToWorldCart(gx, gy);

    /* Flash + shake bien marcados para que la explosión "se sienta". */
    if (this.cameras && this.cameras.main) {
      try { this.cameras.main.flash(260, 255, 240, 200); } catch (e1) {}
      try { this.cameras.main.shake(360, 0.012); } catch (e2) {}
    }

    /* Núcleo brillante: usamos scale (no tweenamos `radius`, que en algunos
       casos no redibuja la geometría del Arc). */
    var coreBase = self.cellSize * 0.30;
    var core = this.add.circle(c.x, c.y, coreBase, 0xfff6c8, 0.95).setDepth(45);
    core.setScale(0.3);
    this.tweens.add({
      targets: core,
      scaleX: 2.2,
      scaleY: 2.2,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onComplete: function () { try { core.destroy(); } catch (e0) {} }
    });

    /* Partículas: chispas con la textura de la dinamita o de la roca. */
    var keyForParticles = null;
    if (this.textures && this.textures.exists('dinamita')) keyForParticles = 'dinamita';
    else if (this.textures && this.textures.exists('rocaroja')) keyForParticles = 'rocaroja';
    if (keyForParticles && this.add && typeof this.add.particles === 'function') {
      try {
        var em = this.add.particles(c.x, c.y, keyForParticles, {
          speed: { min: 120, max: 320 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.22, end: 0 },
          alpha: { start: 1, end: 0 },
          rotate: { min: -180, max: 180 },
          lifespan: 850,
          quantity: 32,
          emitting: false
        });
        em.setDepth(44);
        em.explode(32);
        this.time.delayedCall(1100, function () { try { em.destroy(); } catch (eD) {} });
      } catch (eP) {}
    }

    /* Onda expansiva amarilla (anillo grueso amarillo) — usa scale. */
    var ringBase = self.cellSize * 0.45;
    var ring1 = this.add.circle(c.x, c.y, ringBase, 0xfacc15, 0)
      .setStrokeStyle(6, 0xfacc15, 0.95)
      .setDepth(43);
    ring1.setScale(0.25);
    this.tweens.add({
      targets: ring1,
      scaleX: 3.0,
      scaleY: 3.0,
      alpha: 0,
      duration: 720,
      ease: 'Sine.easeOut',
      onComplete: function () { try { ring1.destroy(); } catch (eR) {} }
    });

    /* Onda secundaria naranja, levemente retardada. */
    var ring2 = this.add.circle(c.x, c.y, ringBase, 0xfb923c, 0)
      .setStrokeStyle(4, 0xfb923c, 0.85)
      .setDepth(42);
    ring2.setScale(0.2);
    this.tweens.add({
      targets: ring2,
      scaleX: 2.4,
      scaleY: 2.4,
      alpha: 0,
      duration: 560,
      ease: 'Sine.easeOut',
      delay: 80,
      onComplete: function () { try { ring2.destroy(); } catch (eR2) {} }
    });

    this.playExplosionSound();

    /* Borra de level.objetos los tipos indicados en la casilla. */
    if (this.level && Array.isArray(this.level.objetos)) {
      this.level.objetos = this.level.objetos.filter(function (o) {
        if (o.x !== gx || o.y !== gy) return true;
        if (!tipos || !tipos.length) return false;
        return tipos.indexOf(o.tipo) === -1;
      });
    }

    /* Pop + destroy de los sprites correspondientes. */
    if (this.obstacleSprites && this.obstacleSprites.length) {
      var keep = [];
      this.obstacleSprites.forEach(function (s) {
        if (!s || !s.active) return;
        var sx = s.getData ? s.getData('gx') : null;
        var sy = s.getData ? s.getData('gy') : null;
        var st = s.getData ? s.getData('tipo') : null;
        var match = (sx === gx && sy === gy) && (!tipos || !tipos.length || tipos.indexOf(st) !== -1);
        if (!match) { keep.push(s); return; }
        self.tweens.add({
          targets: s,
          scale: (s.scale || 1) * 1.45,
          alpha: 0,
          angle: (s.angle || 0) + Phaser.Math.Between(-25, 25),
          duration: 380,
          ease: 'Cubic.easeIn',
          onComplete: function () { try { s.destroy(); } catch (eDS) {} }
        });
      });
      this.obstacleSprites = keep;
    }

    /* Esperamos lo suficiente para que se vea TODA la animación (ring1 = 700ms). */
    if (onDone) this.time.delayedCall(820, onDone);
  };

  /* Efecto: un objeto "alza el vuelo" y se desvanece (mosca, mariposa, etc.).
     - Sube ~2 celdas mientras gira ligero y mueve un sutil aleteo (scaleX).
     - Partículas + brillo dorado.
     - Borra el objeto de level.objetos y obstacleSprites al terminar. */
  GameScene.prototype.volarObjetoEn = function (gx, gy, tipos, onDone) {
    var self = this;
    var c = this.gridToWorldCart(gx, gy);
    var cell = this.cellSize || 48;

    var plumaKey = null;
    if (this.textures && this.textures.exists('mosca')) plumaKey = 'mosca';
    else if (this.textures && this.textures.exists('dinamita')) plumaKey = 'dinamita';
    if (plumaKey && this.add && typeof this.add.particles === 'function') {
      try {
        var em = this.add.particles(c.x, c.y, plumaKey, {
          speedY: { min: -120, max: -260 },
          speedX: { min: -60, max: 60 },
          gravityY: -20,
          angle: { min: -100, max: -80 },
          scale: { start: 0.08, end: 0 },
          alpha: { start: 0.8, end: 0 },
          rotate: { min: -90, max: 90 },
          lifespan: 1100,
          quantity: 14,
          emitting: false
        });
        em.setDepth(44);
        em.explode(14);
        this.time.delayedCall(1300, function () { try { em.destroy(); } catch (eDD) {} });
      } catch (ePP) {}
    }

    /* Brillo dorado que sube y se desvanece. */
    var ring = this.add.circle(c.x, c.y, cell * 0.32, 0xfde68a, 0)
      .setStrokeStyle(3, 0xfacc15, 0.9)
      .setDepth(43);
    ring.setScale(0.4);
    this.tweens.add({
      targets: ring,
      scaleX: 2.4,
      scaleY: 2.4,
      y: c.y - cell * 0.6,
      alpha: 0,
      duration: 720,
      ease: 'Sine.easeOut',
      onComplete: function () { try { ring.destroy(); } catch (e1) {} }
    });

    if (tipos && tipos.indexOf('mosca') !== -1) {
      try {
        this.playAvisoSound('mosca_muerta');
      } catch (eMos) {}
    }

    /* Borra del modelo lógico. */
    if (this.level && Array.isArray(this.level.objetos)) {
      this.level.objetos = this.level.objetos.filter(function (o) {
        if (o.x !== gx || o.y !== gy) return true;
        if (!tipos || !tipos.length) return false;
        return tipos.indexOf(o.tipo) === -1;
      });
    }

    /* Vuelo + fade del/los sprites del objeto. */
    if (this.obstacleSprites && this.obstacleSprites.length) {
      var keep = [];
      this.obstacleSprites.forEach(function (s) {
        if (!s || !s.active) return;
        var sx = s.getData ? s.getData('gx') : null;
        var sy = s.getData ? s.getData('gy') : null;
        var st = s.getData ? s.getData('tipo') : null;
        var match = (sx === gx && sy === gy) && (!tipos || !tipos.length || tipos.indexOf(st) !== -1);
        if (!match) { keep.push(s); return; }
        var sBase = s.scale || 1;
        /* Aleteo: scaleX oscila brevemente antes de despegar. */
        self.tweens.add({
          targets: s,
          scaleX: { from: sBase, to: sBase * 0.7 },
          yoyo: true,
          repeat: 2,
          duration: 90,
          ease: 'Sine.easeInOut'
        });
        /* Despegue: sube ~2 celdas mientras se desvanece y gira ligero. */
        self.tweens.add({
          targets: s,
          y: s.y - cell * 2.2,
          x: s.x + cell * 0.4,
          angle: (s.angle || 0) - 10,
          alpha: 0,
          duration: 900,
          ease: 'Sine.easeIn',
          onComplete: function () { try { s.destroy(); } catch (eDS) {} }
        });
      });
      this.obstacleSprites = keep;
    }

    if (onDone) this.time.delayedCall(960, onDone);
  };

  /* NPC u objeto que "sale corriendo" del mapa (humo + sprint lateral).
     Quita de level.objetos al inicio para liberar la casilla de golpe. */
  GameScene.prototype.retirarObjetoEn = function (gx, gy, tipos, onDone) {
    var self = this;
    var c = this.gridToWorldCart(gx, gy);
    var cell = this.cellSize || 48;

    if (this.cameras && this.cameras.main) {
      try { this.cameras.main.shake(220, 0.006); } catch (eSh) {}
    }

    var dustKey = null;
    if (this.textures && this.textures.exists('dinamita')) dustKey = 'dinamita';
    else if (this.textures && this.textures.exists('bombeitor')) dustKey = 'bombeitor';
    if (dustKey && this.add && typeof this.add.particles === 'function') {
      try {
        var em = this.add.particles(c.x, c.y, dustKey, {
          speedX: { min: -220, max: -90 },
          speedY: { min: -70, max: 70 },
          scale: { start: 0.14, end: 0 },
          alpha: { start: 0.9, end: 0 },
          rotate: { min: -120, max: 120 },
          lifespan: 700,
          quantity: 22,
          emitting: false
        });
        em.setDepth(44);
        em.explode(22);
        this.time.delayedCall(900, function () { try { em.destroy(); } catch (eD) {} });
      } catch (eP) {}
    }

    var puff = this.add.circle(c.x, c.y, cell * 0.25, 0xe5e7eb, 0.45).setDepth(43);
    this.tweens.add({
      targets: puff,
      scaleX: 2.1,
      scaleY: 1.5,
      alpha: 0,
      x: c.x - cell * 0.35,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: function () { try { puff.destroy(); } catch (ePu) {} }
    });

    var retiraBombeitor =
      tipos && tipos.length && tipos.indexOf('bombeitor') !== -1;
    var retiraSombrero =
      tipos && tipos.length && tipos.indexOf('sombrero') !== -1;
    if (retiraBombeitor) {
      this.playBombeitorExitSound();
    } else if (retiraSombrero && Logic.isAudioUsable(Logic.audioTreasure)) {
      try { Logic.playAudioSafe(Logic.audioTreasure); } catch (eA) {}
    }

    if (this.level && Array.isArray(this.level.objetos)) {
      this.level.objetos = this.level.objetos.filter(function (o) {
        if (o.x !== gx || o.y !== gy) return true;
        if (!tipos || !tipos.length) return false;
        return tipos.indexOf(o.tipo) === -1;
      });
    }

    if (this.obstacleSprites && this.obstacleSprites.length) {
      var keep = [];
      this.obstacleSprites.forEach(function (s) {
        if (!s || !s.active) return;
        var sx = s.getData ? s.getData('gx') : null;
        var sy = s.getData ? s.getData('gy') : null;
        var st = s.getData ? s.getData('tipo') : null;
        var match = (sx === gx && sy === gy) && (!tipos || !tipos.length || tipos.indexOf(st) !== -1);
        if (!match) {
          keep.push(s);
          return;
        }
        var sBase = s.scale || 1;
        self.tweens.add({
          targets: s,
          scaleY: { from: sBase, to: sBase * 0.88 },
          yoyo: true,
          repeat: 1,
          duration: 70,
          ease: 'Sine.easeInOut'
        });
        self.tweens.add({
          targets: s,
          x: s.x + cell * 2.8,
          y: s.y - cell * 0.15,
          angle: (s.angle || 0) + Phaser.Math.Between(4, 10),
          alpha: 0,
          scaleX: sBase * 1.06,
          scaleY: sBase * 1.06,
          duration: 820,
          ease: 'Cubic.easeIn',
          delay: 40,
          onComplete: function () { try { s.destroy(); } catch (eDS) {} }
        });
      });
      this.obstacleSprites = keep;
    }

    if (typeof this.syncSombreroDestMarker === 'function') this.syncSombreroDestMarker();

    if (onDone) this.time.delayedCall(920, onDone);
  };

  GameScene.prototype.closeTaskModal = function (opts) {
    var self = this;
    var refs = this._taskModalRefs;
    var skipRestore = !!(opts && opts.skipRestoreChecklist);
    var instant = !!(opts && opts.instant);
    /* Tras cerrar un aviso con `accion` todavía estamos en la misma _taskIndex;
       showMetaMarker() borraría el punto y, si la meta tiene marcador: false,
       no lo volvería a crear hasta avanzar — puede dejar el mapa sin marca. */
    var deferMetaRefresh = !!(opts && opts.deferMetaRefresh);
    if (refs) {
      if (refs.modal && refs.modal.active) {
        if (instant) {
          try {
            refs.modal.destroy(true);
          } catch (eInst) {}
        } else {
          try {
            self.tweens.add({
              targets: refs.modal,
              alpha: 0,
              duration: 220,
              ease: 'Sine.easeIn',
              onComplete: function () {
                if (refs.modal && refs.modal.destroy) refs.modal.destroy(true);
              }
            });
          } catch (e) {
            if (refs.modal && refs.modal.destroy) refs.modal.destroy(true);
          }
        }
      }
      if (refs.backdrop && refs.backdrop.destroy) {
        try {
          self.tweens.add({
            targets: refs.backdrop,
            alpha: 0,
            duration: 200,
            onComplete: function () {
              if (refs.backdrop && refs.backdrop.destroy) refs.backdrop.destroy();
            }
          });
        } catch (e2) {
          refs.backdrop.destroy();
        }
      }
    }
    this._taskModalRefs = null;
    this._taskModalActive = false;
    /* Sin esto, tryRecoverStuckTaskAtMeta veía latch === _taskIndex y modal ya cerrado y reabría el mismo aviso. */
    this._taskMetaLatchIndex = -1;
    this.clearQuestionAxisGuides();
    /* Si encadenamos otra modal (aviso → pregunta), no mostrar el dock de fondo. */
    if (skipRestore) {
      this.setPlayDialogDockVisible(false);
    } else {
      this.setPlayDialogDockVisible(true);
      this.updatePlayDialogDock();
    }
    /* Restaura el panel-checklist al estado que tenía antes del modal,
       a menos que el llamador pida posponerlo (p.ej. para no robarle
       atención a una animación cinemática como la explosión o para
       encadenar otro modal a continuación). */
    if (skipRestore) {
      /* Conservamos _taskListWasCollapsed para que la próxima modal
         encadenada herede el estado original (visible/colapsado). */
      this._taskListPendingRestore = this._taskListWasCollapsed === false;
    } else {
      if (this._taskListBg && this._taskListWasCollapsed === false) {
        this.setTaskListCollapsed(false);
      }
      this._taskListWasCollapsed = null;
    }
    if (!skipRestore) {
      this.syncSombreroDestMarker();
      if (!deferMetaRefresh) {
        this.showMetaMarker();
      } else {
        /* deferMetaRefresh evitaba un refresh en el mismo instante; un frame después
           reapinta el waypoint (magia/Sir + iniciarLimitePasos) sin esperar al fin de la cinemática. */
        var sceneRef = this;
        this.time.delayedCall(0, function () {
          if (!sceneRef.sys || !sceneRef.sys.isActive()) return;
          if (typeof sceneRef.showMetaMarker === 'function') sceneRef.showMetaMarker();
        });
      }
    }
  };

  /** Pies de Penny sobre el vértice (intersección) de la casilla cartesiana (cx, cy). */
  GameScene.prototype.explorerCellAnchor = function (cx, cy) {
    var p = this.gridToWorldCart(cx, cy);
    if (this._useExplorerSprite) {
      var nudgeY =
        typeof this._explorerFeetNudgeY === 'number'
          ? this._explorerFeetNudgeY
          : 0;
      return { x: p.x, y: p.y + nudgeY };
    }
    return {
      x: p.x + this.cellSize * 0.5,
      y: p.y - this.cellSize * 0.5
    };
  };

  GameScene.prototype.syncFromGrid = function () {
    var p = this.explorerCellAnchor(this.pos.x, this.pos.y);
    if (this.character) {
      if (this._useExplorerSprite) {
        this.character.setPosition(Math.round(p.x), Math.round(p.y));
      } else {
        this.character.setPosition(p.x, p.y);
      }
    }
  };

  /** Aullido al entrar en casilla vecina de un lobo (incluye diagonales).
   *  Se rearma cuando Penny se aleja a 3+ casillas, para que no suene en cada paso. */
  GameScene.prototype.checkLoboProximidad = function () {
    if (this._ending || !this._lobosObjetos || !this._lobosObjetos.length) return;
    var minDist = Infinity;
    for (var i = 0; i < this._lobosObjetos.length; i++) {
      var l = this._lobosObjetos[i];
      var d = Math.max(Math.abs(this.pos.x - l.x), Math.abs(this.pos.y - l.y));
      if (d < minDist) minDist = d;
    }
    if (minDist >= 3) {
      this._loboCanHowl = true;
    }
    if (minDist <= 1 && this._loboCanHowl) {
      this._loboCanHowl = false;
      if (
        this.sound &&
        !this.sound.mute &&
        this.cache &&
        this.cache.audio &&
        this.cache.audio.exists('loboFeroz')
      ) {
        try {
          this.sound.play('loboFeroz', { volume: 0.55 });
        } catch (eLh) {}
      }
    }
  };

  GameScene.prototype.scheduleVictoria = function () {
    var self = this;
    if (this._ending) return;
    this._ending = true;
    this.setPlayDialogDockVisible(false);
    var BGM_FADE_MS = 500;
    stopBgMusic(this, BGM_FADE_MS);
    if (this._tesoroBrilloEmitter) {
      try {
        if (typeof this._tesoroBrilloEmitter.stop === 'function') this._tesoroBrilloEmitter.stop();
        this._tesoroBrilloEmitter.destroy();
      } catch (eBr) {}
      this._tesoroBrilloEmitter = null;
    }
    if (this._obstaclePulseTimer) {
      try {
        if (typeof this._obstaclePulseTimer.remove === 'function') this._obstaclePulseTimer.remove(false);
        else if (this.time && typeof this.time.removeEvent === 'function') this.time.removeEvent(this._obstaclePulseTimer);
      } catch (eR) {}
      this._obstaclePulseTimer = null;
    }
    if (this.tweens) this.tweens.killAll();

    /* Estrellas de la fase de juego: cofre + bono si sobran muchos pasos. */
    var rules = window.SCORE_RULES || {};
    var ganado = rules.llegadaCofre != null ? rules.llegadaCofre : 30;
    var maxMov = this._maxMovimientosVigente != null ? this._maxMovimientosVigente : this.level.maxMovimientos;
    if (this._limiteActivo && maxMov != null && maxMov > 0 && this.movimientosRestantes != null && isFinite(this.movimientosRestantes)) {
      var ratio = this.movimientosRestantes / maxMov;
      var umbral = rules.bonoEficienciaUmbral != null ? rules.bonoEficienciaUmbral : 0.3;
      if (ratio >= umbral) ganado += rules.bonoEficiencia != null ? rules.bonoEficiencia : 10;
    }
    var totalPrev = this.registry.get('starsTotal');
    if (totalPrev == null) totalPrev = 0;
    this.registry.set('starsTotal', totalPrev + ganado);
    var perLevel = this.registry.get('starsPerLevel') || {};
    perLevel[this.levelIndex] = (perLevel[this.levelIndex] || 0) + ganado;
    this.registry.set('starsPerLevel', perLevel);
    this.registry.set('lastGameEarned', ganado);
    if (this.__starsHud && this.__starsHud.active) {
      this.__starsHud.setText('⭐ ' + (totalPrev + ganado));
      Anim.animPop(this, this.__starsHud);
    }

    var tc = this.gridToWorldCart(this.level.tesoro.x, this.level.tesoro.y);
    Particles.efectoTesoro(this, tc.x, tc.y);
    Particles.efectoConfeti(this);
    if (this.treasureSprite && this.treasureSprite.active) {
      Anim.animPop(this, this.treasureSprite);
    }

    var goToVictoryFlow = function () {
      if (!self.sys || !self.sys.isActive()) return;
      if (self.tweens) self.tweens.killAll();
      var gameRef = self.game;
      var levelRef = self.level;
      var idx = self.levelIndex;
      var usaTareas = !!(levelRef && levelRef.tareas && levelRef.tareas.length);
      var tienePreguntas = !!(levelRef && levelRef.preguntas && levelRef.preguntas.length);
      Transition.fadeOut(self, function () {
        if (!gameRef || !gameRef.scene) return;
        gameRef.registry.set('lastCompletedLevel', levelRef);
        gameRef.registry.set('lastVictoryLevelIndex', idx);
        if (!usaTareas && tienePreguntas) {
          gameRef.scene.start('PostLevelScene', { levelIndex: idx });
        } else {
          gameRef.scene.start('VictoryScene');
        }
      }, VICTORY_TIMING.mapFadeMs);
    };

    this.time.delayedCall(BGM_FADE_MS + 80, function () {
      if (!self.sys || !self.sys.isActive()) return;
      stopAllGameplaySounds(self);
      playLevelCompletedSound(self, goToVictoryFlow);
    });
  };

  GameScene.prototype.scheduleDerrota = function (motivo, opts) {
    opts = opts || {};
    var self = this;
    if (this._ending) return;
    this._ending = true;
    var BGM_FADE_MS = 420;
    var DRAMA_MS = 720;
    stopBgMusic(this, BGM_FADE_MS);
    if (this._obstaclePulseTimer) {
      try {
        if (typeof this._obstaclePulseTimer.remove === 'function') this._obstaclePulseTimer.remove(false);
        else if (this.time && typeof this.time.removeEvent === 'function') this.time.removeEvent(this._obstaclePulseTimer);
      } catch (eR2) {}
      this._obstaclePulseTimer = null;
    }
    if (this.tweens) this.tweens.killAll();

    var sinPasos = motivo === 'sinPasos';
    var sinEstrellas = motivo === 'sinEstrellas';
    var dramatic = sinPasos || sinEstrellas;
    if (this.character && this.character.active) {
      Anim.animShake(this, this.character);
      Particles.efectoError(this, this.character.x, this.character.y);
      if (dramatic) {
        this.tweens.add({
          targets: this.character,
          alpha: 0,
          scale: 0,
          angle: { from: -8, to: 8 },
          duration: DRAMA_MS,
          ease: 'Sine.easeIn'
        });
      }
    } else {
      Particles.efectoError(this, this.cameras.main.centerX, this.cameras.main.centerY);
    }
    if (!opts.skipToast) {
      if (sinPasos) {
        UI.mostrarMensaje(this, '¡Te quedaste sin pasos! Game over.', { holdMs: 2200 });
      } else if (sinEstrellas) {
        UI.mostrarMensaje(this, '¡Te quedaste sin estrellas!\nDemasiadas imprudencias…', {
          holdMs: 2600
        });
      }
    }

    var goToDefeatScreen = function () {
      if (!self.sys || !self.sys.isActive()) return;
      if (self.tweens) self.tweens.killAll();
      var gameRef = self.game;
      var idxRef = self.levelIndex;
      Transition.fadeOut(self, function () {
        if (!gameRef || !gameRef.scene) return;
        gameRef.registry.set('defeatLevelIndex', idxRef);
        gameRef.registry.set('defeatMotivo', motivo || null);
        gameRef.scene.start('DefeatScene');
      }, 380);
    };

    var beatMs = dramatic ? Math.max(BGM_FADE_MS, DRAMA_MS) + 100 : BGM_FADE_MS + 160;
    this.time.delayedCall(beatMs, function () {
      if (!self.sys || !self.sys.isActive()) return;
      stopAllGameplaySounds(self);
      playGameOverSound(self, goToDefeatScreen);
    });
  };

  /** La misión actual pide pisar esta casilla (no se penaliza imprudencia). */
  GameScene.prototype.isMissionGoalCell = function (gx, gy) {
    var task = this.getCurrentTask ? this.getCurrentTask() : null;
    if (!task || !task.meta) return false;
    return this.isMetaSatisfied(task.meta, { x: gx, y: gy });
  };

  /** Aviso de imprudencia (−⭐) y derrota si se llega a 0 estrellas. */
  GameScene.prototype.showImprudenciaFeedback = function (msg, pen) {
    var self = this;
    var rulesPen = window.SCORE_RULES || {};
    var defPen = rulesPen.imprudenciaColision != null ? rulesPen.imprudenciaColision : 5;
    var amount = pen != null ? pen : defPen;
    if (amount > 0) {
      var lost = this.applyImprudenciaStars(amount);
      if (lost > 0) {
        msg += '\n−' + lost + ' ⭐ · imprudente';
      } else {
        msg += '\n(Sin ⭐ que restar — ya estás en 0)';
      }
    }
    var msgCompact = this.cameras.main.width < 520 || this.cameras.main.height < 560;
    var starsNow = this.registry.get('starsTotal');
    if (starsNow == null) starsNow = 0;
    var sinEstrellasAhora = starsNow <= 0;
    if (sinEstrellasAhora) {
      msg += '\n\n¡Sin estrellas! Debes reintentar la misión.';
    }
    UI.mostrarMensaje(this, msg, {
      fontSize: msgCompact ? 12 : 14,
      padding: { x: msgCompact ? 9 : 11, y: msgCompact ? 6 : 7 },
      holdMs: sinEstrellasAhora ? (msgCompact ? 2800 : 3000) : msgCompact ? 2500 : 2700
    });
    if (sinEstrellasAhora) {
      this.time.delayedCall(msgCompact ? 3200 : 3400, function () {
        if (!self.sys || !self.sys.isActive() || self._ending) return;
        self.scheduleDerrota('sinEstrellas', { skipToast: true });
      });
    }
  };

  /** Resta ⭐ por imprudencia (pisar obstáculo). Devuelve cuántas ⭐ se perdieron. */
  GameScene.prototype.applyImprudenciaStars = function (pen) {
    if (pen == null || pen <= 0) return 0;
    var totalStars = this.registry.get('starsTotal');
    if (totalStars == null) totalStars = 0;
    var newTotal = Math.max(0, totalStars - pen);
    var lost = totalStars - newTotal;
    this.registry.set('starsTotal', newTotal);
    var perLevel = this.registry.get('starsPerLevel') || {};
    var li = this.levelIndex;
    var prevL = perLevel[li] == null ? 0 : perLevel[li];
    perLevel[li] = Math.max(0, prevL - pen);
    this.registry.set('starsPerLevel', perLevel);
    if (this.__starsHud && this.__starsHud.active) {
      this.__starsHud.setText('⭐ ' + newTotal);
      Anim.animShake(this, this.__starsHud);
    }
    return lost;
  };

  GameScene.prototype.tryMove = function (dir) {
    this.tickTaskModalRecovery();
    if (this._taskModalActive) return;
    if (this._moving || this._ending) return;
    var self = this;
    var next = Logic.moverPersonaje(this.pos, dir);
    var rulesPen = window.SCORE_RULES || {};
    var defPen = rulesPen.imprudenciaColision != null ? rulesPen.imprudenciaColision : 5;
    /* Filtra tipos puramente decorativos (no bloquean el paso). */
    var blockingObjetos = (this.level.objetos || []).filter(function (o) {
      return (
        o.tipo !== 'dinamita' &&
        o.tipo !== 'binocular' &&
        o.tipo !== 'sombrero' &&
        o.tipo !== 'sultanRastreo'
      );
    });
    if (Logic.hayColision(next, blockingObjetos)) {
      Particles.efectoError(this, this.character.x, this.character.y);
      Anim.animShake(this, this.character);
      /* Mensaje contextual según el obstáculo pisado. */
      var hit = null;
      for (var oi = 0; oi < blockingObjetos.length; oi++) {
        var ob = blockingObjetos[oi];
        if (ob.x === next.x && ob.y === next.y) { hit = ob; break; }
      }
      var msg = '¡Hay un obstáculo!';
      var pen = 0;
      if (hit) {
        switch (hit.tipo) {
          case 'lobo':
            msg = '¡Cuidado, te muerde!';
            pen = rulesPen.imprudenciaLobo != null ? rulesPen.imprudenciaLobo : defPen;
            break;
          case 'sultan':
          case 'sultanRastreo':
            msg = '¡No puedes pisar a Sabiondo! Es imprudente acercarte así; rodea su casilla.';
            pen = defPen;
            break;
          case 'mosca':
            msg = '¡Casi pisas la mosca de M.A.D.! Zumba y pierdes calma (y estrellas).';
            pen = defPen;
            break;
          case 'bombeitor':
            msg = '¡Imprudente! No pises a Bombeitor: acércate a una casilla vecina para hablar.';
            pen = defPen;
            break;
          case 'sirVectorius':
            msg = '¡Cuidado! No pises a Sir Vectorius: quédate en una casilla vecina para escucharle.';
            pen = defPen;
            break;
          case 'secuazMad':
            msg = '¡El Secuaz de M.A.D. no te deja pasar! Acércate a una casilla vecina para interrogarle.';
            pen = defPen;
            break;
          case 'buho':
            msg = 'El búho no deja que lo pises. Rodea su rama con cuidado.';
            pen = defPen;
            break;
          case 'rocaroja':
            msg = 'Te estrellaste contra la roca roja. ¡Mira el mapa antes de chocar!';
            pen = defPen;
            break;
          case 'arbol':
            msg = 'Intentaste atravesar el árbol. Los troncos no se esquivan solos.';
            pen = defPen;
            break;
          case 'roca':
            msg = 'Chocaste con la roca. Planifica el camino para no perder ⭐.';
            pen = defPen;
            break;
          default:
            msg = '¡Hay algo que bloquea el paso! No conviene pisarlo.';
            pen = defPen;
            break;
        }
      } else {
        pen = defPen;
      }
      if (hit && this.isMissionGoalCell(hit.x, hit.y)) {
        pen = 0;
      }
      var starsCol = this.registry.get('starsTotal');
      if (starsCol == null) starsCol = 0;
      var derrotaPorEstrellas = pen > 0 && starsCol - pen <= 0;
      if (!derrotaPorEstrellas) {
        if (
          hit &&
          hit.tipo === 'lobo' &&
          this.sound &&
          !this.sound.mute &&
          this.cache &&
          this.cache.audio &&
          this.cache.audio.exists('loboFeroz')
        ) {
          try {
            this.sound.play('loboFeroz', { volume: 0.65 });
          } catch (eLM) {}
        }
        if (Logic.isAudioUsable(Logic.audioWrong)) {
          Logic.playAudioSafe(Logic.audioWrong);
        }
      }
      this.showImprudenciaFeedback(msg, pen);
      return;
    }
    if (Logic.fueraDelMapa(next, this.level)) {
      Particles.efectoError(this, this.character.x, this.character.y);
      Anim.animShake(this, this.character);
      var penBorde = rulesPen.imprudenciaFueraMapa != null ? rulesPen.imprudenciaFueraMapa : defPen;
      if (this.isMissionGoalCell(next.x, next.y)) {
        penBorde = 0;
      }
      var starsBorde = this.registry.get('starsTotal');
      if (starsBorde == null) starsBorde = 0;
      var derrotaBorde = penBorde > 0 && starsBorde - penBorde <= 0;
      if (!derrotaBorde && Logic.isAudioUsable(Logic.audioWrong)) {
        Logic.playAudioSafe(Logic.audioWrong);
      }
      this.showImprudenciaFeedback(
        'Este mapa tiene fronteras: no puedes seguir por ahí. Vuelve a explorar dentro del plano.',
        penBorde
      );
      return;
    }
    var fromGx = this.pos.x;
    var fromGy = this.pos.y;
    var prevX = this.character.x;
    var prevY = this.character.y;
    this.pos = next;
    if (this._limiteActivo) {
      this.movimientosRestantes -= 1;
    }
    this.__movRestantes = this.movimientosRestantes;
    UI.mostrarCoordenadas(this, this.pos.x, this.pos.y);
    if (Logic.isAudioUsable(Logic.audioStep)) {
      Logic.playAudioSafe(Logic.audioStep);
    }
    Particles.efectoMovimiento(this, prevX, prevY, dir);
    var fromAnchor = self.explorerCellAnchor(fromGx, fromGy);
    var p = self.explorerCellAnchor(self.pos.x, self.pos.y);
    var moveMs = self._useExplorerSprite ? EXPLORER_MOVE_MS_PER_CELL : 315;
    var toX = p.x;
    var toY = p.y;
    if (self._useExplorerSprite) {
      var fx = Math.round(fromAnchor.x);
      var fy = Math.round(fromAnchor.y);
      toX = Math.round(p.x);
      toY = Math.round(p.y);
      self.character.setPosition(fx, fy);
    }
    this._moving = true;
    this.tweens.killTweensOf(this.character);
    if (self._charBaseScale != null && self.character && self.character.setScale) {
      self.character.setScale(self._charBaseScale);
    }
    prepareExplorerWalkForMove(self, dir);
    /* Penny: solo animar el eje que mueve la casilla; si se tween-ean x e y a la vez,
       Phaser puede micro-mover y en pasos ←→ y se ve un brinco vertical. */
    var tweenOpts = {
      targets: this.character,
      duration: moveMs,
      ease: self._useExplorerSprite ? 'Linear' : 'Sine.easeInOut',
      onUpdate: function (tw) {
        if (!self.character || !self.character.active) {
          try {
            tw.stop();
          } catch (e) {}
        }
      },
      onComplete: function () {
        self._moving = false;
        if (!self.character || !self.character.active) return;
        self.tweens.killTweensOf(self.character);
        if (self._charBaseScale != null && self.character.setScale) {
          self.character.setScale(self._charBaseScale);
        }
        if (self._useExplorerSprite) {
          self.character.setPosition(toX, toY);
        }
        setExplorerIdleForDirection(self, dir);
        explorerSnapCharacterPixels(self);
        if (!self._useExplorerSprite) {
          Anim.animBounce(self, self.character);
        }
        self.checkLoboProximidad();
        if (typeof self.syncSombreroDestMarker === 'function') self.syncSombreroDestMarker();
        if (typeof self.syncMissionAxisGuides === 'function') self.syncMissionAxisGuides();
        if (typeof self.syncMontanasWaypointMarker === 'function') self.syncMontanasWaypointMarker();
        if (self.level && self.level.id === 2 && self._taskIndex >= 15) {
          if (typeof self.forceDispelSecuazFog === 'function') self.forceDispelSecuazFog();
        } else if (typeof self.syncSecuazFog === 'function') {
          self.syncSecuazFog();
        }

        if (self.hasTareas()) {
          var llegoCofre = Logic.llegoAlTesoro(self.pos, self.level.tesoro);
          var current = self.getCurrentTask();
          if (current && self.isMetaSatisfied(current.meta, self.pos)) {
            self.clearMissionAxisGuides();
            /* Pose de llegada opcional (ej.: mirar hacia la derecha al pisar el origen). */
            if (current.facingOnArrival) {
              setExplorerIdleForDirection(self, current.facingOnArrival);
            }
            /* Una sola vez por tarea: evita reabrir el diálogo al quedarse en la misma casilla
               (p. ej. sombrero: aviso → pregunta) y que _taskModalActive quede bloqueado. */
            if (self._taskMetaLatchIndex !== self._taskIndex) {
              self.promptCurrentTaskArrival(current);
              return;
            }
          }
          if (llegoCofre && (!current || current.meta.tipo !== 'cofre')) {
            UI.mostrarMensaje(self, 'Primero completa tu misión actual.');
          }
          if (self._limiteActivo && self.movimientosRestantes <= 0) {
            self.scheduleDerrota('sinPasos');
          }
          return;
        }

        if (Logic.llegoAlTesoro(self.pos, self.level.tesoro)) {
          self.scheduleVictoria();
        } else if (self._limiteActivo && self.movimientosRestantes <= 0) {
          self.scheduleDerrota('sinPasos');
        }
      }
    };
    if (self._useExplorerSprite && (dir === 'izquierda' || dir === 'derecha')) {
      tweenOpts.x = toX;
    } else if (self._useExplorerSprite && (dir === 'arriba' || dir === 'abajo')) {
      tweenOpts.y = toY;
    } else {
      tweenOpts.x = toX;
      tweenOpts.y = toY;
    }
    this.tweens.add(tweenOpts);
  };

  GameScene.prototype.create = function () {
    var self = this;
    destroyVictoryHtmlBar();
    ensureSceneCameraReady(this);
    this._moving = false;
    this._ending = false;
    this._taskIndex = 0;
    this._taskMetaLatchIndex = -1;
    this._taskChainingModal = false;
    this._taskChainingSince = 0;
    this._taskNoticeAdvanceScheduled = false;
    this._taskModalActive = false;
    this._taskHintShown = false;
    this._taskModalRefs = null;
    this.treasureSprite = null;
    this._tesoroBrilloEmitter = null;
    this._lobosObjetos = null;
    this._loboCanHowl = false;
    this.obstacleSprites = [];
    this.level = levels[this.levelIndex];
    if (!this.level) return;

    resetLevelObjetosForPlay(this.level);

    MissionFlow.missionRuntimeInitScene(this);
    if (MissionFlow.missionRuntimeShouldValidateStatic()) {
      var ctcVal = MissionFlow.validateLevel(this.level);
      console.log('[CTC]', MissionFlow.formatValidationReport(ctcVal));
      if (!ctcVal.ok) {
        console.error(
          '[CTC] Hay errores en el guion de misiones; revisa src/levels.js o quita ?ctcValidateMissions=1'
        );
      }
    }

    this._plane = Logic.getPlaneMetrics(this.level);
    this.level.anchoMapa = this._plane.ancho;
    this.level.altoMapa = this._plane.alto;

    if (this.cameras && this.cameras.main) {
      this.cameras.main.roundPixels = true;
    }

    ensureBgMusic(this);

    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    if ((!w || !h) && this.scale) {
      w = this.scale.width || w;
      h = this.scale.height || h;
    }
    if (!w || !h) {
      w = 800;
      h = 600;
    }
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    var playGrad = this.add.graphics();
    playGrad.setScrollFactor(0);
    playGrad.setDepth(-3000);
    bindViewportGradient(this, playGrad);

    var isPortrait = h > w;
    var isCompact = w < 520 || h < 560;
    var ancho = this._plane.ancho;
    var alto = this._plane.alto;
    var xMin = this._plane.xMin;
    var yMin = this._plane.yMin;
    var isDesktopLandscape = !isPortrait && w >= 900;
    var dockPlan = planDialogDock(w, h);
    this.__dialogDockH = dockPlan.dockH;
    this.__dialogDockTopY = dockPlan.dockTopY;
    this.__dialogDockMarginBottom = dockPlan.marginBottom;
    /* Margen izq. pequeño (etiquetas Y van dentro del plano); derecho para el cofre en +7. */
    var axisPadLeft = isPortrait ? 6 : isDesktopLandscape ? 10 : isCompact ? 12 : 16;
    var axisPadRight = isPortrait
      ? Math.max(18, Math.floor(w * 0.05))
      : isDesktopLandscape
        ? 16
        : isCompact
          ? 22
          : 28;
    var maxGridW = w - axisPadLeft - axisPadRight;
    /* Fondo desde y=0; HUD flota sobre el mapa. Rejilla más arriba → más alto para preguntas. */
    this.__mapTopY = 0;
    this.__mapCropTopFrac = 0;
    this.__mapCoverBoost = 1.08;
    var gridTop = isPortrait ? 8 : isDesktopLandscape ? 4 : isCompact ? 36 : 6;
    var hudTopReserve = gridTop;
    this.__axisPadLeft = axisPadLeft;
    this.__axisPadRight = axisPadRight;
    this.__hudTopReserve = hudTopReserve;

    this.pos = { x: this.level.personajeInicial.x, y: this.level.personajeInicial.y };
    /* Bandera de límite: por defecto refleja level.maxMovimientos.
       Algunas tareas la activan a mitad del nivel vía iniciarLimitePasos. */
    this._limiteActivo = this.level.maxMovimientos != null;
    this._maxMovimientosVigente = this.level.maxMovimientos;
    this.movimientosRestantes = this._limiteActivo ? this.level.maxMovimientos : Infinity;
    this.__movRestantes = this.movimientosRestantes;

    var stackBottom = h - dockPlan.marginBottom;
    /* Reserva abajo: diálogo + franja visible para numeración del eje X (sobre el mapa). */
    var dockReserve = Math.max(96, Math.floor(h * 0.19));
    var estCell = maxGridW / ancho;
    if (stackBottom - gridTop - dockReserve > 0) {
      estCell = Math.min(estCell, (stackBottom - gridTop - dockReserve) / alto);
    }
    var estTickFont = isPortrait
      ? Math.max(11, Math.min(18, Math.floor(estCell * 0.34)))
      : Math.max(14, Math.min(26, Math.floor(estCell * 0.4)));
    this.__xAxisLabelReserve = 0;
    var maxGridH = Math.max(80, stackBottom - gridTop - dockReserve);
    var isDesktopWide = !isPortrait && w >= 700;
    var cellBoost = isPortrait ? (isCompact ? 1.02 : 1.05) : 1;
    this.cellSize = Math.min(maxGridW / ancho, maxGridH / alto) * cellBoost;
    var gridW = this.cellSize * ancho;
    var gridH = this.cellSize * alto;
    if (gridH > maxGridH) {
      this.cellSize = maxGridH / alto;
      gridW = this.cellSize * ancho;
      gridH = this.cellSize * alto;
    }
    /* PC: si sobra alto, agrandar celdas hasta llenar (sin salirse de ancho). */
    if (isDesktopWide && gridH < maxGridH * 0.9) {
      var tallCell = maxGridH / alto;
      if (tallCell * ancho <= maxGridW) {
        this.cellSize = tallCell;
        gridW = this.cellSize * ancho;
        gridH = this.cellSize * alto;
      }
    }
    if (!isPortrait && gridH < maxGridH * 0.82) {
      var fillCell = maxGridH / alto;
      if (fillCell * ancho <= maxGridW) {
        this.cellSize = fillCell;
        gridW = this.cellSize * ancho;
        gridH = this.cellSize * alto;
      }
    }
    if (isPortrait) {
      this.gridOriginX = axisPadLeft;
      this.gridOriginY = gridTop;
    } else {
      this.gridOriginX = Math.max(axisPadLeft, Math.floor((w - gridW) / 2));
      this.gridOriginY = gridTop;
    }
    this.__xLabelReserve = 0;
    this.__planeStackBottomY = this.gridOriginY + gridH;
    this.__xLabelsBottomY = this.__planeStackBottomY;
    this.__dialogDockTopY = this.__planeStackBottomY;
    this.__dialogDockH = stackBottom - this.__dialogDockTopY;
    this.__isDesktopLandscape = isDesktopLandscape;
    this.__playBottomPad = this.__dialogDockH;
    var gridMidX = this.gridOriginX + gridW / 2;
    var gridMidY = this.gridOriginY + gridH / 2;
    this.__playArea = { x: this.gridOriginX, y: this.gridOriginY, w: gridW, h: gridH };

    try {
      this._buildPlayfieldUiAndBoard({
        w: w,
        h: h,
        isPortrait: isPortrait,
        isCompact: isCompact,
        ancho: ancho,
        alto: alto,
        xMin: xMin,
        yMin: yMin,
        gridW: gridW,
        gridH: gridH,
        gridMidX: gridMidX,
        gridMidY: gridMidY,
        wrapHelp: Math.min(Math.max(220, gridW - 40), gridW - 20),
        helpFont: 'Verdana, Geneva, "DejaVu Sans", "Liberation Sans", "Helvetica Neue", Arial, sans-serif',
        fsStoryHelp: isCompact ? 13 : 14,
        fsHintHelp: isCompact ? 12 : 13,
        fsCoordBar: isPortrait ? 10 : isCompact ? 11 : 12,
        hintStr:
          this.level && this.level.playHint
            ? this.level.playHint
            : isCompact
              ? 'Meta: llegar al cofre.\nMuévete de a un paso.\nComputadora: flechas del teclado.\nCelular: toca la casilla donde quieres ir.\nEsc: pausa.'
              : 'Meta: llegar al cofre.\nMuévete de a un paso (una casilla vecina cada vez).\nComputadora: teclas de dirección.\nCelular: toca la casilla donde quieres ir.\nEsc: pausa.'
      });
    } catch (ePlayfield) {
      console.error('[Caza Tesoro] Error al montar el mapa de juego:', ePlayfield);
    }

    ensureSceneCameraReady(this);
    this.time.delayedCall(80, function () {
      if (!self.sys || !self.sys.isActive()) return;
      ensureSceneCameraReady(self);
    });

    this.events.once('shutdown', function () {
      if (self.input && self.input.keyboard && self.__escPauseHandler) {
        self.input.keyboard.off('keydown-ESC', self.__escPauseHandler);
        self.__escPauseHandler = null;
      }
      if (self.input && self.input.keyboard && self.__explorerDebugHandler) {
        self.input.keyboard.off('keydown-F2', self.__explorerDebugHandler);
        self.__explorerDebugHandler = null;
      }
      if (self._explorerDebugLayer) {
        self._explorerDebugLayer.destroy();
        self._explorerDebugLayer = null;
      }
      if (self._tesoroBrilloEmitter) {
        try {
          if (typeof self._tesoroBrilloEmitter.stop === 'function') self._tesoroBrilloEmitter.stop();
          self._tesoroBrilloEmitter.destroy();
        } catch (eTb) {}
        self._tesoroBrilloEmitter = null;
      }
      if (self._gridTouchZone) {
        self._gridTouchZone.destroy();
        self._gridTouchZone = null;
      }
      if (self._obstaclePulseTimer) {
        try {
          if (typeof self._obstaclePulseTimer.remove === 'function') self._obstaclePulseTimer.remove(false);
          else if (self.time && typeof self.time.removeEvent === 'function') self.time.removeEvent(self._obstaclePulseTimer);
        } catch (eS) {}
        self._obstaclePulseTimer = null;
      }
      self._lobosObjetos = null;
      self._loboCanHowl = false;
      if (self._taskModalRefs) {
        try { self.closeTaskModal(); } catch (eM) {}
      }
      try { self.destroyPlayDialogDock(); } catch (ePd) {}
      if (self._mapPlayMask) {
        try {
          self._mapPlayMask.destroy();
        } catch (eMk) {}
        self._mapPlayMask = null;
      }
      self.__playMapImage = null;
      try { self.clearMetaMarker(); } catch (eMM) {}
      try { self.clearMontanasWaypointMarker(); } catch (eMw) {}
      self.__coordHudText = null;
      self.__msgText = null;
      self.__msgHideTimer = null;
      self.__starsHud = null;
      try {
        self.clearSombreroDestMarker();
      } catch (eSm) {}
      try {
        self.clearQuestionAxisGuides();
      } catch (eQg) {}
      try {
        self.clearMissionAxisGuides();
      } catch (eMg) {}
      try {
        self.clearSecuazFog();
      } catch (eFog) {}
      if (self.tweens) self.tweens.killAll();
    });
  };

  GameScene.prototype._buildPlayfieldUiAndBoard = function (ctx) {
    var self = this;
    var w = ctx.w;
    var h = ctx.h;
    var isPortrait = !!ctx.isPortrait;
    var isCompact = ctx.isCompact;
    var ancho = ctx.ancho;
    var alto = ctx.alto;
    var xMin = ctx.xMin;
    var yMin = ctx.yMin != null ? ctx.yMin : this.ensurePlaneMetrics().yMin;
    var gridW = ctx.gridW;
    var gridH = ctx.gridH;
    var gridMidX = ctx.gridMidX;
    var gridMidY = ctx.gridMidY;
    var mapInfoEarly = resolveLevelMapTexture(this, this.level);
    var gridAspect = alto / Math.max(1, ancho);
    var useTallMapLayout = mapInfoEarly && !mapInfoEarly.fallback && gridAspect >= 1.15;
    var portraitTall = isPortrait && useTallMapLayout;
    /* PC: ilustración y rejilla estiran hacia la caja de diálogo (sin hueco muerto arriba/abajo). */
    var landscapeTallMap = !isPortrait && useTallMapLayout;
    var xLblRes = self.__xLabelReserve != null ? self.__xLabelReserve : 28;
    var deskLand = !!self.__isDesktopLandscape;
    var playPad = self.__playBottomPad != null ? self.__playBottomPad : 40;
    var dialogDockH = self.__dialogDockH != null ? self.__dialogDockH : 0;
    var dockTopY =
      self.__mapDecorBottomY != null
        ? self.__mapDecorBottomY
        : self.__dialogDockTopY != null
          ? self.__dialogDockTopY
          : self.getBottomDialogDock().y;
    var mapBottomReserve = portraitTall || landscapeTallMap ? 0 : (isPortrait ? 10 : 14) + dialogDockH;
    var mapTopY = self.__mapTopY != null ? self.__mapTopY : 0;
    var mapViewportH =
      portraitTall || landscapeTallMap
        ? Math.max(gridH + 20, dockTopY - mapTopY)
        : gridH;
    self.__portraitTallMap = portraitTall;
    self.__landscapeTallMap = landscapeTallMap;
    self.__mapViewportH = mapViewportH;
    var wrapHelp = ctx.wrapHelp;
    var helpFont = ctx.helpFont;
    var fsStoryHelp = ctx.fsStoryHelp;
    var fsHintHelp = ctx.fsHintHelp;
    var fsCoordBar = ctx.fsCoordBar;
    var hintStr = ctx.hintStr;

    var helpBtnR = isCompact ? 20 : 22;
    var helpCx = isPortrait
      ? w - 10 - helpBtnR
      : this.gridOriginX + gridW - 10 - helpBtnR;
    var helpCy = isPortrait ? 10 + helpBtnR : this.gridOriginY + 10 + helpBtnR;
    var helpBtnBg = this.add
      .circle(helpCx, helpCy, helpBtnR, 0x1e3a5f, 1)
      .setStrokeStyle(2, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(2600);
    var helpBtnIcon = this.add
      .text(helpCx, helpCy, '?', {
        fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: isCompact ? '20px' : '22px',
        color: '#ffffff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2601);
    var helpHit = this.add
      .zone(helpCx, helpCy, helpBtnR * 2 + 8, helpBtnR * 2 + 8)
      .setScrollFactor(0)
      .setDepth(2602)
      .setInteractive({ useHandCursor: true });

    var coordBarY = isPortrait ? 6 : this.gridOriginY + 8;
    this.__hudCoordY = coordBarY;
    this.__hudCoordAlign = 'left';
    this.__hudCoordTopOrigin = true;
    this.__hudCoordFontPx = fsCoordBar;
    this.__hudCoordStroke = 2;
    var tallPlaneEst = alto >= 11;
    var tickFontEst = tallPlaneEst
      ? Math.max(11, Math.min(18, Math.floor(this.cellSize * 0.34)))
      : Math.max(14, Math.min(26, Math.floor(this.cellSize * 0.4)));
    this.syncHudCoordLayout({ helpCx: helpCx, helpBtnR: helpBtnR, tickFont: tickFontEst });

    UI.mostrarCoordenadas(this, this.pos.x, this.pos.y);

    /* HUD de estrellas: esquina superior derecha del mapa (separado del bloque izq. de posición). */
    var starsTotal = this.registry.get('starsTotal');
    if (starsTotal == null) starsTotal = 0;
    var planeHud = this.ensurePlaneMetrics();
    this.__starsHudX = helpCx;
    this.__starsHudY =
      planeHud.xMin < 0 && !isPortrait
        ? this.gridOriginY + 10
        : helpCy + helpBtnR + 8;
    this.__starsHud = this.add
      .text(this.__starsHudX, this.__starsHudY, '⭐ ' + starsTotal, {
        fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: (isCompact ? 14 : 16) + 'px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: 4
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2600);

    /* Panel-checklist de misiones (todas las tareas del nivel). */
    if (this.hasTareas()) {
      this.buildTaskListHud();
    }

    var hudRowBottom =
      this.__coordHudText && this.__coordHudText.active
        ? Math.max(this.__coordHudText.y + this.__coordHudText.height, helpCy + helpBtnR) + 6
        : helpCy + helpBtnR + 6;
    if (this._taskListBgGeom) {
      hudRowBottom = Math.max(hudRowBottom, this._taskListBgGeom.y + this._taskListBgGeom.h + 6);
    }

    var trySetAyudaCerrada = function () {
      try {
        localStorage.setItem(LS_AYUDA_CERRADA, '1');
      } catch (eLs) {}
    };
    var ayudaCerrada = false;
    try {
      ayudaCerrada = localStorage.getItem(LS_AYUDA_CERRADA) === '1';
    } catch (eR) {}
    self.__helpOpen = !ayudaCerrada;

    var bubbleW = Math.min(wrapHelp, gridW - 16);
    var bubbleX = this.gridOriginX + (gridW - bubbleW) * 0.5;
    var bubbleY = hudRowBottom + 6;
    var bubblePad = 12;
    var innerW = bubbleW - bubblePad * 2;

    var helpCoverH = portraitTall || landscapeTallMap ? mapViewportH : gridH;
    var helpCoverCy =
      portraitTall || landscapeTallMap
        ? mapTopY + helpCoverH * 0.5
        : this.gridOriginY + helpCoverH * 0.5;
    var helpBackdrop = this.add
      .rectangle(
        this.gridOriginX + gridW * 0.5,
        helpCoverCy,
        gridW + 8,
        helpCoverH + 8,
        0x1a1208,
        0.48
      )
      .setScrollFactor(0)
      .setDepth(6)
      .setInteractive();
    var helpStory = this.add
      .text(bubbleX + bubblePad, bubbleY + bubblePad, this.level.story || '', {
        fontFamily: helpFont,
        fontSize: fsStoryHelp + 'px',
        color: '#ffffff',
        align: 'left',
        wordWrap: { width: innerW },
        lineSpacing: 6,
        stroke: '#0f172a',
        strokeThickness: 3
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    var helpHint = this.add
      .text(
        bubbleX + bubblePad,
        helpStory.y + helpStory.height + 10,
        hintStr,
        {
          fontFamily: helpFont,
          fontSize: fsHintHelp + 'px',
          color: '#e8edf3',
          align: 'left',
          wordWrap: { width: innerW },
          lineSpacing: 6,
          stroke: '#0f172a',
          strokeThickness: 2
        }
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(22);
    var bubbleH = helpHint.y + helpHint.height - bubbleY + bubblePad + 44;
    var maxBubbleBottom = this.gridOriginY + gridH - 8;
    if (bubbleY + bubbleH > maxBubbleBottom) {
      bubbleY = Math.max(hudRowBottom + 4, maxBubbleBottom - bubbleH);
      helpStory.setY(bubbleY + bubblePad);
      helpHint.setY(helpStory.y + helpStory.height + 10);
      bubbleH = helpHint.y + helpHint.height - bubbleY + bubblePad + 44;
      if (bubbleY + bubbleH > maxBubbleBottom) {
        bubbleY = Math.max(this.gridOriginY + 4, maxBubbleBottom - bubbleH);
        helpStory.setY(bubbleY + bubblePad);
        helpHint.setY(helpStory.y + helpStory.height + 10);
        bubbleH = helpHint.y + helpHint.height - bubbleY + bubblePad + 44;
      }
    }
    var helpBubble = this.add.graphics();
    helpBubble.lineStyle(1.5, 0xffffff, 0.38);
    helpBubble.strokeRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 14);
    helpBubble.setScrollFactor(0);
    helpBubble.setDepth(22);

    var helpClose = this.add
      .text(bubbleX + bubbleW * 0.5, bubbleY + bubbleH - 14, 'Entendido', {
        fontFamily: helpFont,
        fontSize: isCompact ? '13px' : '14px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: '#1e40af',
        padding: { x: 14, y: 7 }
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(23)
      .setInteractive({ useHandCursor: true });

    var syncHelpPanel = function () {
      var on = self.__helpOpen === true;
      helpBackdrop.setVisible(on);
      helpBubble.setVisible(on);
      helpStory.setVisible(on);
      helpHint.setVisible(on);
      helpClose.setVisible(on);
    };

    var closeHelp = function () {
      self.__helpOpen = false;
      trySetAyudaCerrada();
      syncHelpPanel();
    };
    var toggleHelp = function () {
      self.__helpOpen = !self.__helpOpen;
      if (!self.__helpOpen) trySetAyudaCerrada();
      syncHelpPanel();
    };

    helpBackdrop.on('pointerdown', closeHelp);
    helpClose.on('pointerdown', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      closeHelp();
    });
    helpHit.on('pointerdown', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      toggleHelp();
    });

    syncHelpPanel();

    var mapInfo = mapInfoEarly;

    var boardBg = this.add.graphics();
    var skipBoardPanel =
      this.level && this.level.id === 2 && mapInfo && !mapInfo.fallback;
    if (!skipBoardPanel) {
      boardBg.fillStyle(0x2c241c, 0.28);
      boardBg.lineStyle(1.5, 0x8b7355, 0.45);
      /* Solo alrededor de la rejilla: evita la franja oscura bajo la ilustración alargada. */
      var boardH = gridH;
      boardBg.fillRoundedRect(this.gridOriginX - 5, this.gridOriginY - 5, gridW + 10, boardH + 10, 10);
      boardBg.strokeRoundedRect(this.gridOriginX - 5, this.gridOriginY - 5, gridW + 10, boardH + 10, 10);
    }
    boardBg.setDepth(0);

    if (mapInfo) {
      var map = this.add.image(gridMidX, gridMidY, mapInfo.key);
      if (mapInfo.fallback) {
        applyGouacheMapStrip(
          map,
          mapInfo.gouacheStrip != null ? mapInfo.gouacheStrip : this.level
        );
      }
      var mapDecorW = gridW + 20;
      var mapLayout = layoutPlayfieldMap(map, {
        gridW: gridW,
        gridH: gridH,
        gridMidX: gridMidX,
        gridMidY: gridMidY,
        gridOriginX: this.gridOriginX,
        gridOriginY: this.gridOriginY,
        mapTopY: portraitTall || landscapeTallMap ? self.__mapTopY : null,
        mapCropTopFrac:
          portraitTall || landscapeTallMap ? self.__mapCropTopFrac || 0 : 0,
        mapCoverBoost: self.__mapCoverBoost,
        mapLiftPx:
          portraitTall || landscapeTallMap
            ? Math.min(Math.floor(self.cellSize * 1.4), 72)
            : 0,
        dockTopY: portraitTall || landscapeTallMap ? dockTopY : null,
        mapDecorW: mapDecorW,
        viewportW: mapDecorW,
        viewportH: h,
        bottomReserve: mapBottomReserve,
        portraitTall: portraitTall,
        landscapeTallMap: landscapeTallMap,
        mapInfo: mapInfo
      });
      map.setDepth(1);
      self.__playMapImage = map;
      if ((portraitTall || landscapeTallMap) && mapLayout && mapLayout.tallMap) {
        if (self._mapPlayMask && self._mapPlayMask.destroy) self._mapPlayMask.destroy();
        var maskG = self.add.graphics();
        maskG.fillStyle(0xffffff, 1);
        var maskTop = self.__mapTopY != null ? self.__mapTopY : 0;
        maskG.fillRect(
          self.gridOriginX - 8,
          maskTop,
          gridW + 16,
          Math.max(gridH + 8, dockTopY - maskTop)
        );
        maskG.setVisible(false);
        map.setMask(maskG.createGeometryMask());
        self._mapPlayMask = maskG;
      }
      map.setAlpha(mapInfo.fallback ? 0.72 : 1);
      if (mapInfo.fallback && this.level.id === 2) {
        map.setTint(0xb8d4e8);
      }
      console.log(
        '[Caza Tesoro] Mapa en partida — nivel',
        this.level.id,
        ':',
        mapInfo.key,
        mapInfo.fallback ? '(respaldo gouache)' : ''
      );
    } else {
      var mapPh = this.add.graphics();
      mapPh.fillStyle(this.level.id === 2 ? 0x5a7a6a : 0x4a6741, 0.42);
      mapPh.fillRoundedRect(
        this.gridOriginX,
        this.gridOriginY,
        gridW,
        gridH,
        Math.min(12, this.cellSize * 0.2)
      );
      mapPh.setDepth(1);
      if (this.level.id === 2) {
        this.add
          .text(gridMidX, gridMidY, 'Coloca aquí\nmapa_montanas_ilustrado.webp', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: Math.max(12, Math.floor(this.cellSize * 0.32)) + 'px',
            color: '#fef3c7',
            align: 'center',
            stroke: '#1a1208',
            strokeThickness: 3
          })
          .setOrigin(0.5)
          .setDepth(2);
      }
    }

    var g = this.add.graphics();
    g.setDepth(3);
    /* Doble trazo: sombra oscura + blanco para que la rejilla se lea sobre el mapa ilustrado. */
    g.lineStyle(3, 0x1a1208, 0.45);
    for (var i = 0; i <= ancho; i++) {
      var xL = this.gridOriginX + i * this.cellSize;
      g.lineBetween(xL, this.gridOriginY, xL, this.gridOriginY + gridH);
    }
    for (var j = 0; j <= alto; j++) {
      var yL = this.gridOriginY + j * this.cellSize;
      g.lineBetween(this.gridOriginX, yL, this.gridOriginX + gridW, yL);
    }
    g.lineStyle(1.5, 0xffffff, 0.78);
    for (var i2 = 0; i2 <= ancho; i2++) {
      var xL2 = this.gridOriginX + i2 * this.cellSize;
      g.lineBetween(xL2, this.gridOriginY, xL2, this.gridOriginY + gridH);
    }
    for (var j2 = 0; j2 <= alto; j2++) {
      var yL2 = this.gridOriginY + j2 * this.cellSize;
      g.lineBetween(this.gridOriginX, yL2, this.gridOriginX + gridW, yL2);
    }
    g.lineStyle(4, 0x1d4ed8, 0.95);
    var xAxisExtend = Math.min(10, Math.floor(this.cellSize * 0.14));
    var originVx = this.gridOriginX;
    var originVy = this.gridOriginY + gridH;
    var yAxisVx = this.cartXToScreenX(0);
    var yAxisInPlane = 0 >= xMin && 0 <= (this._plane ? this._plane.xMax : xMin + ancho - 1);
    if (!yAxisInPlane) yAxisVx = originVx;
    this.__yAxisScreenX = yAxisVx;
    g.lineBetween(
      this.gridOriginX - xAxisExtend,
      originVy,
      this.gridOriginX + gridW + xAxisExtend,
      originVy
    );
    g.lineBetween(yAxisVx, this.gridOriginY, yAxisVx, this.gridOriginY + gridH);

    var tallPlane = alto >= 11;
    var tickFont = tallPlane
      ? Math.max(11, Math.min(18, Math.floor(this.cellSize * 0.34)))
      : Math.max(14, Math.min(26, Math.floor(this.cellSize * 0.4)));
    var tickStyle = {
      fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
      fontSize: tickFont + 'px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#1a1208',
      strokeThickness: 3
    };
    var tickDepth = PLAYFIELD_TICK_DEPTH;
    var yInset = Math.max(5, Math.floor(this.cellSize * 0.14));
    var yLabelX = yAxisVx - yInset;
    var xInset = Math.max(5, Math.floor(this.cellSize * 0.12));
    self.__xAxisLabelReserve = 0;
    var xLabelsY = originVy - xInset;
    self.__planeStackBottomY = originVy;
    self.__xLabelsBottomY = originVy;
    self.__mapDecorBottomY = originVy;
    self.__dialogDockTopY = originVy;
    var mb = self.__dialogDockMarginBottom != null ? self.__dialogDockMarginBottom : 0;
    self.__dialogDockH = h - self.__dialogDockTopY - mb;
    if (self._mapPlayMask && self._mapPlayMask.active) {
      var maskTopSync = self.__mapTopY != null ? self.__mapTopY : 0;
      self._mapPlayMask.clear();
      self._mapPlayMask.fillStyle(0xffffff, 1);
      self._mapPlayMask.fillRect(
        self.gridOriginX - 8,
        maskTopSync,
        gridW + 16,
        Math.max(8, self.__dialogDockTopY - maskTopSync)
      );
    }
    if (
      self.__playMapImage &&
      self.__playMapImage.active &&
      (portraitTall || landscapeTallMap) &&
      mapInfoEarly &&
      !mapInfoEarly.fallback
    ) {
      layoutPlayfieldMap(self.__playMapImage, {
        gridW: gridW,
        gridH: gridH,
        gridMidX: gridMidX,
        gridMidY: gridMidY,
        gridOriginX: self.gridOriginX,
        gridOriginY: self.gridOriginY,
        mapTopY: self.__mapTopY,
        mapCropTopFrac: self.__mapCropTopFrac || 0,
        mapCoverBoost: self.__mapCoverBoost,
        mapLiftPx: Math.min(Math.floor(self.cellSize * 1.4), 72),
        dockTopY: self.__dialogDockTopY,
        mapDecorW: gridW + 20,
        viewportW: gridW + 20,
        viewportH: h,
        portraitTall: portraitTall,
        landscapeTallMap: landscapeTallMap,
        mapInfo: mapInfoEarly
      });
    }
    var yLblStyle = {
      fontFamily: tickStyle.fontFamily,
      fontSize: tickStyle.fontSize,
      color: '#fffef5',
      fontStyle: 'bold',
      stroke: '#0f172a',
      strokeThickness: 4
    };
    var showOriginAtZero = yMin === 0 && yAxisInPlane;
    var xMax = this._plane ? this._plane.xMax : xMin + ancho - 1;
    var yMax = this._plane ? this._plane.yMax : yMin + alto - 1;
    /* Misma regla que gridToWorld: cada valor va sobre la línea del eje (vértice), no al centro de la casilla. */
    for (var labelX = xMin; labelX <= xMax; labelX++) {
      if (showOriginAtZero && labelX === 0) continue;
      var tx = originVx + (labelX - xMin) * this.cellSize;
      var xLbl = formatAxisTickLabel(labelX);
      var xTick = this.add
        .text(tx, xLabelsY, xLbl, tickStyle)
        .setOrigin(0.5, 1)
        .setDepth(tickDepth)
        .setScrollFactor(0);
      if (labelX < 0 && typeof xTick.setLetterSpacing === 'function') {
        xTick.setLetterSpacing(-1);
      }
    }
    for (var labelY = yMin; labelY <= yMax; labelY++) {
      if (showOriginAtZero && labelY === 0) continue;
      var py = originVy - (labelY - yMin) * this.cellSize;
      var yLbl = formatAxisTickLabel(labelY);
      var yTick = this.add
        .text(yLabelX, py, yLbl, yLblStyle)
        .setOrigin(1, 0.5)
        .setDepth(tickDepth)
        .setScrollFactor(0);
      if (labelY < 0 && typeof yTick.setLetterSpacing === 'function') {
        yTick.setLetterSpacing(-1);
      }
    }
    if (showOriginAtZero) {
      this.add
        .text(yAxisVx, xLabelsY, '0', tickStyle)
        .setOrigin(0.5, 1)
        .setDepth(tickDepth)
        .setScrollFactor(0);
      this.add
        .text(yLabelX, originVy, '0', yLblStyle)
        .setOrigin(1, 0.5)
        .setDepth(tickDepth)
        .setScrollFactor(0);
    }
    var axisLblStyle = {
      fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
      fontSize: Math.max(11, tickFont - 2) + 'px',
      color: '#fef3c7',
      fontStyle: 'bold',
      stroke: '#1e1208',
      strokeThickness: 3
    };
    this.add
      .text(originVx + gridW - Math.max(8, this.cellSize * 0.2), xLabelsY, 'x', axisLblStyle)
      .setOrigin(1, 1)
      .setDepth(tickDepth)
      .setScrollFactor(0);
    this.add
      .text(yAxisVx - Math.max(4, yInset * 0.35), this.gridOriginY + Math.max(6, this.cellSize * 0.15), 'y', axisLblStyle)
      .setOrigin(1, 0)
      .setDepth(tickDepth)
      .setScrollFactor(0);

    self.syncHudCoordLayout({
      helpCx: helpCx,
      helpBtnR: helpBtnR,
      tickFont: tickFont
    });
    if (self.__coordHudText && self.__coordHudText.active) {
      UI.mostrarCoordenadas(self, self.pos.x, self.pos.y);
    }

    if (!this.anims.exists('lobo_idle') && this.textures.exists('lobo')) {
      try {
        this.anims.create({
          key: 'lobo_idle',
          frames: this.anims.generateFrameNumbers('lobo', { start: 0, end: 3 }),
          frameRate: 4,
          repeat: -1
        });
      } catch (eLoboAnim) {
        console.warn('[Caza Tesoro] Animación lobo_idle no creada:', eLoboAnim);
      }
    }

    /* Mapping tipo de obstáculo → key de textura ilustrada (cuando existe).
       Si no hay textura para ese tipo se cae al cuadrado de color como fallback. */
    var OBSTACLE_TEXTURE_KEYS = {
      rocaroja: 'rocaroja',
      mosca: 'mosca',
      sultan: 'sultan',
      sultanRastreo: 'sultan2',
      bombeitor: 'bombeitor',
      sirVectorius: 'sirVectorius',
      sombrero: 'sombrero',
      secuazMad: 'secuazDeMad',
      dinamita: 'dinamita',
      binocular: 'binocular',
      buho: 'buho'
    };

    var objetosLista = this.level.objetos || [];
    objetosLista.forEach(function (o) {
      if (!o || o.tipo == null) return;
      var feet;
      try {
        feet = self.npcDisplayAnchor(o.x, o.y, o.tipo);
      } catch (ePos) {
        console.warn('[Caza Tesoro] Objeto omitido (coords):', o, ePos);
        return;
      }

      /* Caso especial: lobo (sprite animado 1×4). */
      if (o.tipo === 'lobo' && self.textures.exists('lobo')) {
        var loboTex = self.textures.get('lobo');
        if (loboTex && typeof loboTex.setFilter === 'function') {
          loboTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
        var lobo = self.add.sprite(feet.x, feet.y, 'lobo', 0);
        var loboBox = self.cellSize * 1.05;
        var ls = Math.min(loboBox / LOBO_FRAME_W, loboBox / LOBO_FRAME_H, 2.5);
        lobo.setScale(ls);
        lobo.setDepth(14);
        if (LOBO_PLAY_IDLE && self.anims.exists('lobo_idle')) lobo.play('lobo_idle');
        else lobo.setFrame(0);
        lobo.setData('tipo', o.tipo); lobo.setData('gx', o.x); lobo.setData('gy', o.y);
        self.obstacleSprites.push(lobo);
        return;
      }

      /* Obstáculos ilustrados (imagen única). */
      var texKey = OBSTACLE_TEXTURE_KEYS[o.tipo];
      if (texKey && self.textures.exists(texKey)) {
        var tex = self.textures.get(texKey);
        if (tex && typeof tex.setFilter === 'function') {
          tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
        /* Offsets para que decoraciones (dinamita) no queden tapadas por la roca. */
        var ox = 0, oy = 0;
        if (o.tipo === 'dinamita') {
          ox = -self.cellSize * 0.32;
          oy = self.cellSize * 0.24;
        }
        if (o.tipo === 'binocular') {
          /* (1,1) cerca del origen: acercar al rostro de Penny en (0,0). */
          ox = -self.cellSize * 0.38;
          oy = -self.cellSize * 0.22;
        }
        var spr = self.add.image(feet.x + ox, feet.y + oy, texKey);
        /* Tamaños personalizados por tipo. */
        var boxMult = 1.0;
        var maxS = 1.8;
        if (o.tipo === 'sultan' || o.tipo === 'bombeitor') {
          boxMult = 1.32;
          maxS = 2.15;
        }
        if (o.tipo === 'sultanRastreo') {
          var suBox = self.cellSize * SULTAN_RASTREO_DISPLAY_BOX;
          spr.setOrigin(0.5, 0.9);
          spr.setPosition(feet.x + ox, feet.y + oy);
          spr.setScale(Math.min(suBox / spr.width, suBox / spr.height, 2.45));
          spr.setDepth(15);
          spr.setData('tipo', o.tipo);
          spr.setData('gx', o.x);
          spr.setData('gy', o.y);
          self.obstacleSprites.push(spr);
          return;
        }
        if (o.tipo === 'sirVectorius') {
          var vBox = self.cellSize * SIR_VECTORIUS_DISPLAY_BOX;
          spr.setOrigin(0.5, 0.92);
          oy = 0;
          spr.setPosition(feet.x + ox, feet.y + oy);
          spr.setScale(Math.min(vBox / spr.width, vBox / spr.height, 2.55));
          spr.setDepth(14);
          spr.setData('tipo', o.tipo);
          spr.setData('gx', o.x);
          spr.setData('gy', o.y);
          self.obstacleSprites.push(spr);
          return;
        }
        if (o.tipo === 'secuazMad') {
          var sBox = self.cellSize * SECUAZ_MAD_DISPLAY_BOX;
          spr.setOrigin(0.5, 0.92);
          oy = self.cellSize * 0.05;
          spr.setPosition(feet.x + ox, feet.y + oy);
          spr.setScale(Math.min(sBox / spr.width, sBox / spr.height, 2.5));
          spr.setDepth(14);
          spr.setData('tipo', o.tipo);
          spr.setData('gx', o.x);
          spr.setData('gy', o.y);
          self.obstacleSprites.push(spr);
          return;
        }
        if (o.tipo === 'dinamita') { boxMult = 0.55; maxS = 1.2; }
        if (o.tipo === 'sombrero') {
          var hBox = self.cellSize * 0.68;
          spr.setOrigin(0.5, 0.85);
          spr.setPosition(feet.x + ox, feet.y + oy);
          spr.setScale(Math.min(hBox / spr.width, hBox / spr.height, 1.3));
          spr.setDepth(14);
          spr.setData('tipo', o.tipo);
          spr.setData('gx', o.x);
          spr.setData('gy', o.y);
          self.obstacleSprites.push(spr);
          return;
        }
        if (o.tipo === 'binocular') { boxMult = 1.05; maxS = 1.9; }
        if (o.tipo === 'buho') { boxMult = 1.08; maxS = 1.85; }
        if (o.tipo === 'mosca') { boxMult = 0.82; maxS = 1.45; }
        var box = self.cellSize * boxMult;
        var ss = Math.min(box / spr.width, box / spr.height, maxS);
        spr.setScale(ss);
        /* Decoraciones (dinamita, telescopio) por encima del suelo pero detrás de Penny. */
        spr.setDepth(o.tipo === 'dinamita' || o.tipo === 'binocular' ? 15 : 14);
        spr.setData('tipo', o.tipo); spr.setData('gx', o.x); spr.setData('gy', o.y);
        self.obstacleSprites.push(spr);
        return;
      }

      /* Mapa ilustrado (montañas): sin cuadrados de respaldo; el arte del PNG basta. */
      if (self.level && self.level.id === 2 && (o.tipo === 'arbol' || o.tipo === 'roca')) return;

      if (texKey && !self.textures.exists(texKey)) {
        console.warn('[Caza Tesoro] Sin textura para objeto:', o.tipo, '→', texKey);
      }

      /* Fallback: cuadrado coloreado para tipos sin sprite. */
      var half = self.cellSize * 0.46;
      var color = o.tipo === 'arbol' ? 0x166534 : 0x57534e;
      var gr = self.add.graphics();
      gr.fillStyle(color, 0.9);
      gr.fillRect(feet.x - half, feet.y - half, half * 2, half * 2);
      gr.setDepth(13);
      gr.setData('tipo', o.tipo); gr.setData('gx', o.x); gr.setData('gy', o.y);
      self.obstacleSprites.push(gr);
    });

    this._obstaclePulseTimer = this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: function () {
        if (self._ending || !self.obstacleSprites || !self.obstacleSprites.length) return;
        var pulso = self.obstacleSprites.filter(function (s) {
          return !(s && s.texture && s.texture.key === 'lobo');
        });
        if (!pulso.length) return;
        var pick = Phaser.Math.Between(0, pulso.length - 1);
        Anim.animPulse(self, pulso[pick]);
      }
    });

    var tc = this.gridToWorldCart(this.level.tesoro.x, this.level.tesoro.y);
    if (this.textures.exists('stickerTesoroCofre')) {
      var tr = this.add.image(tc.x, tc.y, 'stickerTesoroCofre');
      var ts = Math.min((self.cellSize * 1.12) / tr.width, (self.cellSize * 1.12) / tr.height, 1.32);
      tr.setScale(ts);
      tr.setDepth(13);
      self.treasureSprite = tr;
      self.time.delayedCall(80, function () {
        if (!self.sys || !self.sys.isActive()) return;
        if (tr && tr.active) Anim.animPop(self, tr);
      });
    } else {
      var tgc = self.add.circle(tc.x, tc.y, self.cellSize * 0.38, 0xfacc15);
      tgc.setDepth(13);
      self.treasureSprite = tgc;
      self.time.delayedCall(80, function () {
        if (!self.sys || !self.sys.isActive()) return;
        if (tgc && tgc.active) Anim.animPop(self, tgc);
      });
    }

    this._tesoroBrilloEmitter = Particles.createTesoroBrilloAmbient(this, tc.x, tc.y);
    if (this._tesoroBrilloEmitter) {
      var d0 =
        Math.abs(this.pos.x - this.level.tesoro.x) + Math.abs(this.pos.y - this.level.tesoro.y);
      Particles.setTesoroBrilloIntensidad(this._tesoroBrilloEmitter, d0);
    }

    var ck = this.level.characterKey;
    this._useExplorerSprite = false;
    if (ck === 'explorer' && this.textures.exists('explorer')) {
      try {
        ensureExplorerWalkAnims(this);
      } catch (eWalk) {
        console.warn('[Caza Tesoro] Animaciones de Penny no creadas:', eWalk);
      }
      var exTex = this.textures.get('explorer');
      if (exTex && typeof exTex.setFilter === 'function') {
        exTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      this.character = this.add.sprite(
        0,
        0,
        'explorer',
        EXPLORER_ROW.down * EXPLORER_SHEET_COLS + EXPLORER_IDLE_COL
      );
      this._useExplorerSprite = true;
      /* Penny 4×4: altura objetivo ~1.52× celda (un poco más grande que antes ~1.38). */
      var charBox = this.cellSize * PENNY_DISPLAY_BOX;
      var cs = Math.min(charBox / EXPLORER_FRAME_W, charBox / EXPLORER_FRAME_H, 2.38);
      this.character.setScale(cs);
      this._charBaseScale = cs;
      this.character.setOrigin(EXPLORER_ORIGIN_X, EXPLORER_ORIGIN_Y);
      this._explorerFeetNudgeY = Math.round(this.cellSize * EXPLORER_FEET_NUDGE_Y_MULT);
      /* Pixel art: redondear dibujo a píxeles de pantalla reduce “temblor” al mover. */
      if (typeof this.character.setRoundPixels === 'function') this.character.setRoundPixels(true);
      this.character.setDepth(16);
    } else if (ck && this.textures.exists(ck)) {
      var charTex = this.textures.get(ck);
      if (charTex && typeof charTex.setFilter === 'function') {
        charTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      this.character = this.add.image(0, 0, ck);
      var charBox = this.cellSize * 1.34;
      var csImg = Math.min(charBox / this.character.width, charBox / this.character.height, 1.75);
      this.character.setScale(csImg);
      this._charBaseScale = csImg;
      this.character.setDepth(16);
    } else {
      this.character = this.add.circle(0, 0, this.cellSize * 0.48, 0x2563eb);
      this._charBaseScale = 1;
      this.character.setDepth(16);
    }

    this.syncFromGrid();
    this.installGridTouchControls();
    console.log(
      '[Caza Tesoro] Partida lista — nivel',
      this.level.id,
      '| objetos:',
      (this.level.objetos || []).length,
      '| Penny:',
      this.pos.x + ',' + this.pos.y
    );

    if (typeof this.syncSecuazFog === 'function') this.syncSecuazFog();

    if (this.input && this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

      self.__escPauseHandler = function () {
        if (!self.scene.isPaused('GameScene')) {
          self.scene.pause('GameScene');
          self.scene.launch('PauseScene', { gameKey: 'GameScene' });
        }
      };
      this.input.keyboard.on('keydown-ESC', self.__escPauseHandler);

      self.__explorerDebugHandler = function () {
        toggleExplorerDebug(self);
      };
      this.input.keyboard.on('keydown-F2', self.__explorerDebugHandler);
    }

    /* Aullido del lobo: se dispara la primera vez que Penny entra a una casilla vecina
       (distancia Chebyshev = 1, incluye diagonales). Reentra al alejarse 3+ casillas. */
    self._lobosObjetos =
      (self.level.objetos || []).filter(function (ob) {
        return ob.tipo === 'lobo';
      });
    self._loboCanHowl = self._lobosObjetos.length > 0;

    this.__sndPlay = mountSoundToggle(this, {
      skipAutoPosition: true,
      size: 'play',
      depth: PLAY_SOUND_TOGGLE_DEPTH,
      pulse: false
    });
    this.buildPlayDialogDock();
    this.layoutPlaySoundToggle();
    this.renderTaskList();
    this.syncSombreroDestMarker();
    this.showMetaMarker();
    var selfMarker = this;
    this.time.delayedCall(120, function () {
      if (!selfMarker.sys || !selfMarker.sys.isActive()) return;
      selfMarker.syncSombreroDestMarker();
      selfMarker.showMetaMarker();
    });
    this.time.delayedCall(400, function () {
      if (!selfMarker.sys || !selfMarker.sys.isActive()) return;
      selfMarker.syncSombreroDestMarker();
    });
  };

  GameScene.prototype.update = function () {
    if (this.level && this._tesoroBrilloEmitter) {
      var t = this.level.tesoro;
      var d = Math.abs(this.pos.x - t.x) + Math.abs(this.pos.y - t.y);
      Particles.setTesoroBrilloIntensidad(this._tesoroBrilloEmitter, d);
    }
    this.tickTaskModalRecovery();
    if (!this.level || !this.cursors || this._moving || this._ending || this._taskModalActive) return;
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keyW)) {
      this.tryMove('arriba');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.keyS)) {
      this.tryMove('abajo');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.keyA)) {
      this.tryMove('izquierda');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.keyD)) {
      this.tryMove('derecha');
    }
  };

  function PauseScene() {
    Phaser.Scene.call(this, { key: 'PauseScene' });
  }
  PauseScene.prototype = Object.create(Phaser.Scene.prototype);
  PauseScene.prototype.constructor = PauseScene;
  PauseScene.prototype.init = function (data) {
    this.gameKey = data && data.gameKey ? data.gameKey : 'GameScene';
  };
  PauseScene.prototype.create = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var self = this;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    var pauseGrad = this.add.graphics();
    pauseGrad.setScrollFactor(0);
    pauseGrad.setDepth(-200);
    bindViewportGradient(this, pauseGrad);
    Transition.fadeIn(this, 200);
    var dim = this.add.rectangle(w / 2, h / 2, w, h, 0x2a1810, 0.42);
    dim.setDepth(0);
    dim.setInteractive();
    Anim.animFadeIn(this, dim, 250);
    var panel;
    if (this.textures.exists('pantallaPausa')) {
      panel = this.add.image(w / 2, h / 2, 'pantallaPausa');
      layoutMainMenuBgImage(this, panel);
      bindFullscreenIllustrationResize(this, panel, function () {
        layoutMainMenuBgImage(self, panel);
      });
    } else {
      panel = this.add.rectangle(w / 2, h / 2, w * 0.75, h * 0.65, 0x1e293b, 0.95);
    }
    Transition.slideIn(this, 'down', panel);
    if (panel && panel.active) {
      panel.setDepth(2);
      Anim.animPop(this, panel);
    }
    var cont = this.add
      .text(w / 2, h * 0.62, 'Continuar', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#16a34a',
        padding: { x: 24, y: 12 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    cont.setDepth(4);
    ButtonFx.bindAnimatedButton(self, cont, function () {
      self.scene.resume(self.gameKey);
      self.scene.stop();
    });
    var exit = this.add
      .text(w / 2, h * 0.74, 'Salir al menú', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#dc2626',
        padding: { x: 24, y: 12 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    exit.setDepth(4);
    ButtonFx.bindAnimatedButton(self, exit, function () {
      forceGoMainMenu(self, self.gameKey);
    });
    this.events.once('shutdown', function () {
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });
  };

  /** Evita que el mismo toque que pulsó «Menú» en derrota active «Jugar» al abrir el menú (→ prólogo). */
  function setMenuInputGuard(game, ms) {
    if (!game || !game.registry) return;
    game.registry.set('ctcMenuInputGuardUntil', Date.now() + (ms != null ? ms : 480));
  }

  function isMenuInputGuarded(game) {
    if (!game || !game.registry) return false;
    var until = game.registry.get('ctcMenuInputGuardUntil');
    return until != null && Date.now() < until;
  }

  function goDefeatMainMenu(scene) {
    if (!scene || !scene.game) return;
    var g = scene.game;
    stopDefeatScreenMusic(scene);
    setMenuInputGuard(g, 520);
    destroyVictoryHtmlBar();
    destroyDefeatArtButtons(scene);
    stopBgMusic(scene, 120);
    stopAllGameplaySounds(scene);
    /* No parar DefeatScene aquí: si se destruye antes, el handoff a MainMenu no llega a ejecutarse. */
    navigateFromEndScreen(scene, 'MainMenu');
  }

  /**
   * Programa un cambio de escena fuera del reloj de la escena actual (evita blanco si ya se llamó stop).
   */
  function ensureSceneCameraReady(scene) {
    if (!scene || !scene.cameras || !scene.cameras.main) return;
    try {
      Transition.prepareSceneCamera(scene);
      scene.cameras.main.resetFX();
      if (typeof scene.cameras.main.setAlpha === 'function') scene.cameras.main.setAlpha(1);
    } catch (eCam) {}
  }

  function scheduleSceneHandoff(fn) {
    if (typeof fn !== 'function') return;
    if (typeof window !== 'undefined') {
      window.setTimeout(function () {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            requestAnimationFrame(fn);
          });
        } else {
          fn();
        }
      }, 0);
    } else {
      fn();
    }
  }

  /**
   * Menú de inicio sin fadeOut del overlay: el fade de cámara a negro suele dejar la siguiente escena negra.
   * @param {Phaser.Scene} scene escena actual (Victoria, Derrota, Pausa…)
   * @param {string} [stopSceneKey] si está activa, se para antes (p. ej. GameScene bajo la pausa).
   */
  function forceGoMainMenu(scene, stopSceneKey) {
    if (!scene || !scene.game || !scene.game.scene) return;
    stopVictoryScreenMusic(scene);
    stopDefeatScreenMusic(scene);
    var g = scene.game;
    setMenuInputGuard(g, 480);
    var run = function () {
      if (!g || !g.scene) return;
      try {
        if (scene.sys && scene.sys.isActive()) {
          if (scene.tweens) scene.tweens.killAll();
          Transition.prepareSceneCamera(scene);
          if (scene.cameras && scene.cameras.main) scene.cameras.main.resetFX();
        }
      } catch (eG) {}
      if (stopSceneKey && g.scene.isActive(stopSceneKey)) {
        try {
          g.scene.stop(stopSceneKey);
        } catch (eS) {}
      }
      stopRegisteredGameScenes(g, 'MainMenu');
      prepareGameCameras(g);
      try {
        g.scene.start('MainMenu');
      } catch (eStart) {
        console.error('[Caza Tesoro] No se pudo abrir MainMenu:', eStart);
      }
    };
    scheduleSceneHandoff(run);
  }

  /**
   * Cambiar de escena desde victoria/derrota sin camera.fadeOut: ese fade suele dejar la siguiente escena negra
   * o impedir que el input/layout arranquen bien (misma familia de fallos que forceGoMainMenu).
   */
  function navigateFromEndScreen(scene, targetKey, targetData) {
    if (!scene || !scene.game || !scene.game.scene) return;
    stopVictoryScreenMusic(scene);
    stopDefeatScreenMusic(scene);
    var g = scene.game;
    var payload = targetData != null ? targetData : {};
    if (targetKey === 'MainMenu') setMenuInputGuard(g, 480);
    var run = function () {
      if (!g || !g.scene) return;
      try {
        if (scene.sys && scene.sys.isActive()) {
          if (scene.tweens) scene.tweens.killAll();
          Transition.prepareSceneCamera(scene);
          if (scene.cameras && scene.cameras.main) scene.cameras.main.resetFX();
        }
      } catch (eG) {}
      stopRegisteredGameScenes(g, targetKey);
      try {
        g.scene.start(targetKey, payload);
        var started = g.scene.getScene(targetKey);
        if (started && started.sys && started.sys.isActive()) {
          ensureSceneCameraReady(started);
        }
      } catch (eStart) {
        console.error('[Caza Tesoro] navigateFromEndScreen:', targetKey, eStart);
      }
    };
    scheduleSceneHandoff(run);
    scheduleSceneHandoff(function () {
      if (!g || !g.scene) return;
      var sc = g.scene.getScene(targetKey);
      if (sc && sc.sys && sc.sys.isActive()) ensureSceneCameraReady(sc);
    });
  }

  /** Solo escenas registradas en el Game (no tocar escenas internas de Phaser → eso dejaba el gestor roto al rato). */
  var CTC_GAME_SCENE_KEYS = [
    'BootScene',
    'MainMenu',
    'IntroPrologueScene',
    'PreLevelScene',
    'GameScene',
    'PostLevelScene',
    'PauseScene',
    'VictoryScene',
    'DefeatScene',
    'EpilogoContinuaraScene'
  ];

  function prepareGameCameras(g) {
    if (!g || !g.scene) return;
    try {
      var active = g.scene.getScenes(true);
      for (var i = 0; i < active.length; i++) {
        var sc = active[i];
        try {
          Transition.prepareSceneCamera(sc);
          if (sc.cameras && sc.cameras.main) sc.cameras.main.resetFX();
        } catch (eC) {}
      }
    } catch (e) {}
  }

  function stopRegisteredGameScenes(g, exceptKey) {
    if (!g || !g.scene) return;
    try {
      var active = g.scene.getScenes(true);
      for (var i = 0; i < active.length; i++) {
        var sk = active[i].scene.key;
        if (exceptKey && sk === exceptKey) continue;
        if (CTC_GAME_SCENE_KEYS.indexOf(sk) >= 0) {
          try {
            g.scene.stop(sk);
          } catch (eS) {}
        }
      }
    } catch (e2) {}
  }

  /** Para reinicio limpio: destruye la pista en registry (ensureBgMusic crea una nueva). */
  function restartBgMusic(game) {
    if (!game || !game.registry) return;
    var music = game.registry.get('bgMusic');
    if (!music) return;
    try {
      music.stop();
    } catch (eS) {}
    try {
      music.destroy();
    } catch (eD) {}
    try {
      game.registry.remove('bgMusic');
    } catch (eR) {
      game.registry.set('bgMusic', null);
    }
  }

  /** Al reintentar, quita ⭐ y medalla de ese intento (total partida coherente). */
  function resetLevelStarsForRetry(registry, levelIndex) {
    if (!registry) return;
    var perLevel = registry.get('starsPerLevel') || {};
    var gained = perLevel[levelIndex];
    if (gained != null && gained > 0) {
      var total = registry.get('starsTotal');
      if (total == null) total = 0;
      registry.set('starsTotal', Math.max(0, total - gained));
      perLevel[levelIndex] = 0;
      registry.set('starsPerLevel', perLevel);
    }
    var medals = registry.get('medalsPerLevel') || {};
    if (medals[levelIndex]) {
      delete medals[levelIndex];
      registry.set('medalsPerLevel', medals);
    }
  }

  /**
   * Reintentar el nivel actual: sin fadeOut (evita pantalla vacía), música nueva, mapa desde cero.
   * @param {Phaser.Scene} fromScene Victoria, Derrota, etc.
   * @param {number} levelIndex
   * @param {{ viaPreLevel?: boolean, resetLevelStars?: boolean }} [opts]
   */
  function restartCurrentLevel(fromScene, levelIndex, opts) {
    opts = opts || {};
    if (!fromScene || !fromScene.game || !fromScene.game.scene) return;
    var g = fromScene.game;
    var li = Phaser.Math.Clamp(levelIndex != null ? levelIndex : 0, 0, levels.length - 1);
    var targetKey = opts.viaPreLevel ? 'PreLevelScene' : 'GameScene';
    destroyVictoryHtmlBar();
    stopBgMusic(fromScene, 120);
    restartBgMusic(g);
    if (opts.resetLevelStars !== false) {
      resetLevelStarsForRetry(g.registry, li);
    }
    var run = function () {
      if (!g || !g.scene) return;
      try {
        if (fromScene.tweens && fromScene.sys && fromScene.sys.isActive()) {
          fromScene.tweens.killAll();
        }
        Transition.prepareSceneCamera(fromScene);
        if (fromScene.cameras && fromScene.cameras.main) {
          fromScene.cameras.main.resetFX();
        }
      } catch (ePrep) {}
      stopRegisteredGameScenes(g, targetKey);
      try {
        g.scene.start(targetKey, { levelIndex: li });
        var started = g.scene.getScene(targetKey);
        if (started && started.sys && started.sys.isActive()) {
          ensureSceneCameraReady(started);
        }
      } catch (eStart) {
        console.error('[Caza Tesoro] restartCurrentLevel:', eStart);
      }
    };
    scheduleSceneHandoff(run);
  }

  /** Ms tras parar escenas antes de `start`: evita solapar shutdown/create y pantallas a medias (solo degradado + «?»). */
  var CTC_HTML_NAV_DELAY_MS = 120;

  /**
   * Navegación desde HTML (Ensayo / victoria): limpia cámara, para solo escenas del juego, start tras un breve margen.
   * Cola por generación: solo aplica el último clic si el usuario pulsa muy rápido varias veces.
   */
  function htmlNavigateToScene(g, key, data) {
    if (!g || !g.scene || !key) return;
    destroyVictoryHtmlBar();
    if (typeof g._ctcHtmlNavGen !== 'number') g._ctcHtmlNavGen = 0;
    var myGen = ++g._ctcHtmlNavGen;
    prepareGameCameras(g);
    try {
      if (g.scene.isPaused && g.scene.isPaused('GameScene')) {
        g.scene.resume('GameScene');
      }
    } catch (eRes) {}
    stopRegisteredGameScenes(g, key);
    var run = function () {
      try {
        if (!g || !g.scene) return;
        if (myGen !== g._ctcHtmlNavGen) return;
        if (data !== undefined && data !== null) {
          g.scene.start(key, data);
        } else {
          g.scene.start(key);
        }
      } catch (eStart) {
        console.error('[Caza Tesoro] htmlNavigateToScene:', key, eStart);
      }
    };
    if (typeof window !== 'undefined') {
      window.setTimeout(function () {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            requestAnimationFrame(run);
          });
        } else {
          run();
        }
      }, CTC_HTML_NAV_DELAY_MS);
    } else {
      run();
    }
  }

  /** Tiempos de la secuencia de victoria (mapa → pantalla → siguiente nivel). */
  var VICTORY_TIMING = {
    mapCelebrationMs: 1500,
    mapFadeMs: 480,
    sceneFadeInMs: 420,
    medalDelayMs: 700,
    textStaggerMs: 380,
    bridgeDelayMs: 1550,
    buttonsDelayMs: 3400
  };

  function fadeInVictoryText(scene, obj, delayMs) {
    if (!obj || !scene || !scene.tweens) return;
    obj.setAlpha(0);
    scene.tweens.add({
      targets: obj,
      alpha: 1,
      duration: 480,
      delay: delayMs || 0,
      ease: 'Sine.easeOut'
    });
  }

  function destroyVictoryHtmlBar() {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('ctc-victory-overlay');
    if (!el) return;
    try {
      if (el._ctcResizeHandler && el._ctcResizeScene && el._ctcResizeScene.scale) {
        el._ctcResizeScene.scale.off('resize', el._ctcResizeHandler);
      }
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch (eP) {}
  }

  /** Ancho y posición de la barra HTML alineados al arte de pantallaVictoria. */
  function computeVictoryHtmlBarGeom(scene, panel, viewportW, viewportH) {
    var isPortrait = viewportH > viewportW;
    var imgW =
      panel && panel.active && panel.displayWidth > 8
        ? panel.displayWidth
        : viewportW * (isPortrait ? 0.96 : 0.88);
    var inset = Math.max(6, Math.round(imgW * 0.03));
    var barW = Math.max(210, imgW - inset * 2);
    var barLeft = (viewportW - imgW) * 0.5 + inset;
    if (barLeft < 4) barLeft = 4;
    if (barLeft + barW > viewportW - 4) barW = Math.max(210, viewportW - barLeft - 8);

    var canvas = scene && scene.game && scene.game.canvas;
    if (canvas && typeof canvas.getBoundingClientRect === 'function' && viewportW > 0) {
      var cr = canvas.getBoundingClientRect();
      if (cr.width > 0) {
        var sx = cr.width / viewportW;
        barLeft = cr.left + barLeft * sx;
        barW = barW * sx;
      }
    }

    var btnGap = isPortrait ? 5 : 6;
    var btnSlot = (barW - btnGap * 2) / 3;
    return {
      left: barLeft,
      width: barW,
      btnSlot: btnSlot,
      btnGap: btnGap,
      bottomCss: 'max(8px,env(safe-area-inset-bottom))'
    };
  }

  function applyVictoryHtmlBarLayout(root, scene, panel, viewportW, viewportH) {
    if (!root) return null;
    var geom = computeVictoryHtmlBarGeom(scene, panel, viewportW, viewportH);
    root.style.left = Math.round(geom.left) + 'px';
    root.style.width = Math.round(geom.width) + 'px';
    root.style.right = 'auto';
    root.style.bottom = geom.bottomCss;
    root.dataset.barSlot = String(Math.floor(geom.btnSlot));
    var row = root.querySelector('[data-ctc-victory-btn-row]');
    if (row) row.style.gap = geom.btnGap + 'px';
    var btns = root.querySelectorAll('button');
    var fs = Math.min(13, Math.max(9, Math.floor(geom.btnSlot / 10)));
    var padV = Math.max(6, Math.round(geom.btnSlot * 0.07));
    var padH = Math.max(3, Math.round(geom.btnSlot * 0.05));
    for (var bi = 0; bi < btns.length; bi++) {
      btns[bi].style.fontSize = fs + 'px';
      btns[bi].style.padding = padV + 'px ' + padH + 'px';
    }
    return geom;
  }

  function refreshVictoryHtmlBarLayout(scene, panel) {
    var root = document.getElementById('ctc-victory-overlay');
    if (!root || !scene || !scene.cameras || !scene.cameras.main) return;
    if (panel && panel.active) layoutMainMenuBgImage(scene, panel);
    applyVictoryHtmlBarLayout(root, scene, panel, scene.cameras.main.width, scene.cameras.main.height);
  }

  function estimateWrappedTextHeight(text, wrapW, fontPx, lineSpacing) {
    if (!text || !String(text).trim()) return 0;
    var avgCharW = fontPx * 0.52;
    var charsPerLine = Math.max(10, Math.floor(wrapW / avgCharW));
    var lines = 0;
    var parts = String(text).split('\n');
    for (var pi = 0; pi < parts.length; pi++) {
      lines += Math.max(1, Math.ceil(parts[pi].length / charsPerLine));
    }
    var lh = fontPx + (lineSpacing != null ? lineSpacing : 4);
    return lines * lh - (lineSpacing || 0) + 6;
  }

  /**
   * Hit boxes de los 3 botones pintados en pantalla_derrota.png (1024×1536).
   * Fracciones del panel: Reintentar | Menú | Salir.
   */
  var DEFEAT_ART_BUTTONS = [
    { id: 'retry', left: 0.088, right: 0.338, top: 0.892, bottom: 0.97 },
    { id: 'menu', left: 0.408, right: 0.618, top: 0.892, bottom: 0.97 },
    { id: 'exit', left: 0.728, right: 0.908, top: 0.892, bottom: 0.97 }
  ];

  function computeDefeatButtonRects(viewW, viewH, panel) {
    var pb = getVictoryPanelBounds(viewW, viewH, panel);
    return DEFEAT_ART_BUTTONS.map(function (d) {
      var x0 = pb.left + pb.width * d.left;
      var x1 = pb.left + pb.width * d.right;
      var y0 = pb.top + pb.height * d.top;
      var y1 = pb.top + pb.height * d.bottom;
      return {
        id: d.id,
        x: (x0 + x1) * 0.5,
        y: (y0 + y1) * 0.5,
        w: Math.max(24, x1 - x0),
        h: Math.max(20, y1 - y0)
      };
    });
  }

  function layoutDefeatArtButtons(scene, panel) {
    if (!scene || !scene._defeatHitZones || !scene._defeatHitZones.length) return;
    var cam = scene.cameras && scene.cameras.main;
    if (!cam) return;
    var rects = computeDefeatButtonRects(cam.width, cam.height, panel);
    for (var i = 0; i < scene._defeatHitZones.length; i++) {
      var zone = scene._defeatHitZones[i];
      var rect = rects[i];
      if (!zone || !zone.active || !rect) continue;
      zone.setPosition(rect.x, rect.y);
      zone.setSize(rect.w, rect.h);
    }
  }

  function createDefeatArtHitZone(scene, rect, onClick) {
    var zone = scene.add.zone(rect.x, rect.y, rect.w, rect.h);
    zone.setScrollFactor(0);
    zone.setDepth(60);
    zone.setInteractive({ useHandCursor: true });
    ButtonFx.bindAnimatedButton(scene, zone, onClick, {
      disableIdlePulse: true,
      disablePressPop: true,
      clickSound: 'menu'
    });
    return zone;
  }

  /**
   * Si no se puede cerrar la pestaña: menú con partida nueva (⭐ y medallas a cero).
   */
  function exitGameFromDefeatFallback(scene) {
    if (!scene || !scene.game) return;
    var reg = scene.game.registry;
    if (reg) {
      reg.set('starsTotal', 0);
      reg.set('starsPerLevel', {});
      reg.set('selectedLevel', 1);
      Medals.resetMedalProgress(reg);
      Campaign.resetCampaignProgress(reg);
    }
    goDefeatMainMenu(scene);
  }

  /**
   * Salir → intenta cerrar la pestaña del navegador.
   * Solo suele funcionar si la página se abrió desde un enlace/script; si no, plan B: menú y partida nueva.
   */
  function exitGameFromDefeat(scene) {
    if (typeof window === 'undefined') {
      exitGameFromDefeatFallback(scene);
      return;
    }
    var sceneRef = scene;
    var fallbackTimer = window.setTimeout(function () {
      exitGameFromDefeatFallback(sceneRef);
    }, 400);
    try {
      window.open('', '_self');
      window.close();
    } catch (eClose) {
      window.clearTimeout(fallbackTimer);
      exitGameFromDefeatFallback(scene);
    }
  }

  function mountDefeatArtButtons(scene, panel, levelIndex) {
    if (!scene) return;
    var g = scene.game;
    var li = Phaser.Math.Clamp(levelIndex != null ? levelIndex : 0, 0, levels.length - 1);
    var rects = computeDefeatButtonRects(
      scene.cameras.main.width,
      scene.cameras.main.height,
      panel
    );
    var zones = [];
    zones.push(
      createDefeatArtHitZone(
        scene,
        rects[0],
        wrapDefeatButtonAction(scene, function () {
          restartCurrentLevel(scene, li, { viaPreLevel: false, resetLevelStars: true });
        })
      )
    );
    zones.push(
      createDefeatArtHitZone(
        scene,
        rects[1],
        wrapDefeatButtonAction(scene, function () {
          goDefeatMainMenu(scene);
        })
      )
    );
    zones.push(
      createDefeatArtHitZone(
        scene,
        rects[2],
        wrapDefeatButtonAction(scene, function () {
          exitGameFromDefeat(scene);
        })
      )
    );
    scene._defeatHitZones = zones;
    scene._layoutDefeatArtButtons = function () {
      layoutDefeatArtButtons(scene, panel);
    };
  }

  function destroyDefeatArtButtons(scene) {
    if (!scene) return;
    if (scene._defeatHitZones) {
      for (var i = 0; i < scene._defeatHitZones.length; i++) {
        try {
          if (scene._defeatHitZones[i]) scene._defeatHitZones[i].destroy();
        } catch (eD) {}
      }
    }
    scene._defeatHitZones = null;
    scene._layoutDefeatArtButtons = null;
  }

  /** Rectángulo visible de pantallaVictoria (tras layoutMainMenuBgImage). */
  function getVictoryPanelBounds(viewW, viewH, panel) {
    var imgW =
      panel && panel.active && panel.displayWidth > 8
        ? panel.displayWidth
        : viewW * (viewH > viewW ? 0.96 : 0.88);
    var imgH =
      panel && panel.active && panel.displayHeight > 8
        ? panel.displayHeight
        : viewH;
    var cx = panel && panel.active && panel.x != null ? panel.x : viewW * 0.5;
    var cy = panel && panel.active && panel.y != null ? panel.y : viewH * 0.5;
    return {
      left: cx - imgW / 2,
      right: cx + imgW / 2,
      top: cy - imgH / 2,
      bottom: cy + imgH / 2,
      width: imgW,
      height: imgH
    };
  }

  /**
   * Zona segura en pantallaVictoria: debajo del letrero «Victoria» / cinta roja,
   * sobre el tablón central (evita solapar el arte superior).
   */
  function computeVictoryMedalLayout(viewW, viewH, opts) {
    opts = opts || {};
    var esFinal = !!opts.esFinal;
    var hasBridge = !!opts.hasBridge;
    var bridgeText = opts.bridgeText || '';
    var isPortrait = viewH > viewW;
    /* Reserva inferior para la barra HTML de tres botones en fila (móvil). */
    var bottomReserve = isPortrait ? Math.min(Math.max(viewH * 0.16, 108), 150) : 92;
    var medalH = Math.min(Math.max(viewH * 0.11, 64), isPortrait ? 84 : 100);
    var lineStep = Math.max(20, Math.round(viewH * 0.03));
    if (hasBridge) lineStep = Math.max(16, Math.round(viewH * (isPortrait ? 0.022 : 0.026)));
    var titlePx = Math.round(Math.min(Math.max(19, viewH * 0.028), 26));
    var subPx = Math.round(Math.min(Math.max(16, viewH * 0.024), 22));
    var smallPx = Math.round(Math.min(Math.max(15, viewH * 0.021), isPortrait ? 18 : 20));
    var bridgeFs = isPortrait ? Math.min(15, subPx + 1) : Math.min(17, subPx + 1);
    var bridgeWrap = isPortrait ? Math.min(viewW * 0.82, 320) : Math.min(viewW * 0.84, 360);
    var bridgeH = hasBridge ? estimateWrappedTextHeight(bridgeText, bridgeWrap, bridgeFs, 6) : 0;

    var medalCx = viewW * 0.5;
    var medalCy = viewH * (esFinal ? 0.51 : 0.58);
    var textTop = medalCy + medalH * 0.58 + Math.max(10, viewH * 0.014);
    var bridgeY = viewH * (isPortrait ? 0.635 : 0.58);
    var earnedY = textTop + lineStep * 2;
    var totalY = textTop + lineStep * 3;

    if (esFinal) {
      medalCy = viewH * (isPortrait ? 0.42 : 0.51);
      medalCx = viewW * 0.5;
      textTop = medalCy + medalH * 0.58 + Math.max(10, viewH * 0.014);
      earnedY = textTop + lineStep * 2;
      totalY = textTop + lineStep * 3;
    } else {
      /* Pergamino del PNG: títulos + nota centrados en el tablón (medalla aparte, a la derecha). */
      var panelBounds = getVictoryPanelBounds(viewW, viewH, opts.panel);
      var faceBandBottom = viewH * (isPortrait ? 0.41 : 0.37);
      /* Inicio del tablón: más abajo para usar el centro del pergamino (móvil y PC). */
      var scrollTop = panelBounds.top + panelBounds.height * (isPortrait ? 0.46 : 0.44);
      var scrollBottom =
        panelBounds.bottom - bottomReserve - (isPortrait ? Math.max(10, viewH * 0.016) : 12);
      scrollTop = Math.max(scrollTop, faceBandBottom);
      earnedY = scrollBottom - lineStep * 2.35;
      totalY = scrollBottom - lineStep * 1.15;
      var narrativeBottom = earnedY - lineStep * 0.85;
      var gapBeforeBridge = hasBridge ? Math.max(6, lineStep * 0.35) : 0;
      var blockH = lineStep * 2 + gapBeforeBridge + bridgeH;
      var narrativeH = Math.max(blockH + lineStep, narrativeBottom - scrollTop);
      /* Sesgo fuerte al centro vertical del tablón (título + nota de Gadget). */
      var centerBias = isPortrait ? 0.78 : 0.82;
      var blockTop = scrollTop + Math.max(0, (narrativeH - blockH) * centerBias);
      var plankDrop = panelBounds.height * (isPortrait ? 0.035 : 0.045);
      textTop = blockTop + plankDrop;
      bridgeY = textTop + lineStep * 2 + gapBeforeBridge + bridgeH * 0.5;
      if (blockTop + blockH + plankDrop > narrativeBottom) {
        var overflow = blockTop + blockH + plankDrop - narrativeBottom;
        textTop -= overflow;
        bridgeY -= overflow;
      }
      /* Medalla sobre el cofre (derecha-media), un poco más arriba para no tocar el cabello de Penny. */
      medalCx = panelBounds.left + panelBounds.width * (isPortrait ? 0.64 : 0.68);
      medalCy = panelBounds.top + panelBounds.height * (isPortrait ? 0.265 : 0.245);
      medalCy = Phaser.Math.Clamp(medalCy, faceBandBottom + medalH * 0.32, scrollTop - medalH * 0.42);
      medalCy -= isPortrait ? medalH * 0.06 : medalH * 0.05;
    }

    var panelBoundsAll = getVictoryPanelBounds(viewW, viewH, opts.panel);
    var medalHalf = medalH * 0.52;
    medalCx = Phaser.Math.Clamp(
      medalCx,
      panelBoundsAll.left + medalHalf + 8,
      panelBoundsAll.right - medalHalf - 8
    );
    medalCy = Phaser.Math.Clamp(
      medalCy,
      panelBoundsAll.top + medalHalf + 6,
      panelBoundsAll.bottom - bottomReserve - medalHalf - 4
    );
    if (isPortrait) {
      medalH = Math.min(medalH, Math.round(panelBoundsAll.width * 0.22));
    }

    return {
      cx: viewW * 0.5,
      medalX: medalCx,
      medalY: medalCy,
      medalH: medalH,
      titleY: textTop,
      tierY: textTop + lineStep,
      bridgeY: bridgeY,
      earnedY: earnedY,
      totalY: totalY,
      lineStep: lineStep,
      bottomReserve: bottomReserve,
      isPortrait: isPortrait,
      titlePx: titlePx,
      subPx: subPx,
      smallPx: smallPx,
      bridgeFs: bridgeFs,
      bridgeWrap: bridgeWrap,
      strokeTitle: 6,
      strokeSub: 5,
      finalMsgY: viewH * 0.66,
      finalRowY: viewH * 0.73,
      finalRowMedalH: Math.min(viewH * 0.078, 56),
      finalTitleY: viewH * 0.8,
      finalTitlePx: Math.round(Math.min(Math.max(19, viewH * 0.025), 26))
    };
  }

  /**
   * Barra HTML fija abajo; clics usan htmlNavigateToScene (misma familia que Ensayo, sin parar escenas “rareras”).
   */
  function mountVictoryStyleBar(scene, viewportW, viewportH, panel, opts) {
    destroyVictoryHtmlBar();
    if (!scene || !opts || typeof document === 'undefined' || !document.body) return;
    var g = scene.game;
    if (!g || !g.scene) return;

    var completedLevelIndex = Phaser.Math.Clamp(
      opts.completedLevelIndex != null ? opts.completedLevelIndex : 0,
      0,
      Math.max(0, levels.length - 1)
    );
    var nextLevelIndex =
      opts.nextLevelIndex != null
        ? Phaser.Math.Clamp(opts.nextLevelIndex, 0, Math.max(0, levels.length - 1))
        : completedLevelIndex;
    var rightMode =
      opts.rightMode === 'next' || opts.rightMode === 'continuara'
        ? opts.rightMode
        : 'replay';
    var rightLabel = opts.rightLabel || 'Siguiente nivel';
    var isPortrait = viewportH > viewportW;
    var barGeomPreview = computeVictoryHtmlBarGeom(scene, panel, viewportW, viewportH);
    var compactLabels = barGeomPreview.btnSlot < 120 || isPortrait;

    function addVictoryHarnessBtn(container, label, bgHex, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        'flex:1 1 0;min-width:0;max-width:none;padding:8px 4px;border-radius:8px;border:1px solid #475569;background:' +
        bgHex +
        ';color:#f8fafc;cursor:pointer;text-align:center;font-size:11px;font-weight:600;line-height:1.15;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.35);touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
      b.addEventListener('click', onClick);
      container.appendChild(b);
    }

    var root = document.createElement('div');
    root.id = 'ctc-victory-overlay';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Victoria — acciones');
    root.style.cssText =
      'position:fixed;left:0;right:auto;bottom:max(8px,env(safe-area-inset-bottom));' +
      'display:flex;flex-direction:column;flex-wrap:nowrap;gap:6px;justify-content:center;align-items:stretch;z-index:100050;' +
      'padding:6px 4px;background:rgba(15,23,42,0.94);border-radius:12px;border:1px solid #334155;' +
      'box-shadow:0 12px 36px rgba(0,0,0,0.55);pointer-events:auto;box-sizing:border-box;';

    var victoryPuente =
      opts && opts.victoryPuente ? String(opts.victoryPuente).trim() : '';
    if (victoryPuente) {
      var narrative = document.createElement('p');
      narrative.textContent = victoryPuente;
      narrative.style.cssText =
        'margin:0;padding:0 4px 2px;width:100%;' +
        'font-family:Georgia,"Times New Roman",serif;font-size:14px;line-height:1.45;' +
        'color:#fef9c3;text-align:center;';
      root.appendChild(narrative);
    }

    var albumReward = opts && opts.albumReward ? opts.albumReward : null;
    if (albumReward && albumReward.code) {
      var albumBox = document.createElement('div');
      albumBox.setAttribute('data-ctc-album-code', '1');
      albumBox.style.cssText =
        'margin:0;padding:10px 8px;width:100%;box-sizing:border-box;' +
        'background:rgba(15,23,42,0.97);border:2px solid #fbbf24;border-radius:10px;text-align:center;';
      var albumTitle = document.createElement('p');
      albumTitle.textContent = 'Tu código — álbum Amigos de las Matemáticas';
      albumTitle.style.cssText =
        'margin:0 0 6px;font-family:Georgia,serif;font-size:15px;font-weight:bold;color:#fef3c7;line-height:1.3;';
      albumBox.appendChild(albumTitle);
      var albumSheet = document.createElement('p');
      albumSheet.textContent = 'Lámina: ' + (albumReward.sheetLabel || '');
      albumSheet.style.cssText =
        'margin:0 0 8px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;color:#fde68a;';
      albumBox.appendChild(albumSheet);
      var albumCodeEl = document.createElement('p');
      albumCodeEl.textContent = albumReward.code;
      albumCodeEl.style.cssText =
        'margin:0 auto 8px;display:inline-block;font-family:Consolas,monospace;font-size:20px;font-weight:bold;' +
        'letter-spacing:0.06em;color:#1a1208;background:#fef9c3;padding:8px 14px;border-radius:8px;border:1px solid #ca8a04;';
      albumBox.appendChild(albumCodeEl);
      var albumFoot = document.createElement('p');
      albumFoot.textContent =
        'Copiá o anotá el código tal cual (letras, números y guiones) para la lámina del álbum.';
      albumFoot.style.cssText =
        'margin:0;font-family:system-ui,sans-serif;font-size:11px;line-height:1.35;color:#e2e8f0;';
      albumBox.appendChild(albumFoot);
      root.appendChild(albumBox);
    } else if (opts && opts.albumHint) {
      var albumHint = document.createElement('p');
      albumHint.textContent = String(opts.albumHint);
      albumHint.style.cssText =
        'margin:0;padding:6px 4px;width:100%;font-family:system-ui,sans-serif;font-size:11px;' +
        'line-height:1.35;color:#cbd5e1;text-align:center;';
      root.appendChild(albumHint);
    }

    var btnRow = document.createElement('div');
    btnRow.setAttribute('data-ctc-victory-btn-row', '1');
    btnRow.style.cssText =
      'display:flex;flex-direction:row;flex-wrap:nowrap;gap:' +
      barGeomPreview.btnGap +
      'px;justify-content:stretch;align-items:stretch;width:100%;';

    var lblRetry = compactLabels && barGeomPreview.btnSlot < 92 ? 'Reint.' : 'Reintentar';
    var lblMenu = compactLabels ? 'Menú' : 'Menú principal';
    var lblNext = rightLabel;
    if (compactLabels) {
      if (rightMode === 'next' && /siguiente/i.test(rightLabel)) lblNext = 'Siguiente';
      else if (/jugar de nuevo/i.test(rightLabel)) lblNext = 'De nuevo';
    }

    addVictoryHarnessBtn(
      btnRow,
      lblRetry,
      '#ca8a04',
      wrapVictoryButtonAction(scene, function () {
        try {
          if (Logic.isAudioUsable(Logic.audioCorrect)) Logic.playAudioSafe(Logic.audioCorrect);
        } catch (eS) {}
        restartCurrentLevel(scene, completedLevelIndex, { viaPreLevel: false, resetLevelStars: true });
      })
    );

    addVictoryHarnessBtn(
      btnRow,
      lblMenu,
      '#2563eb',
      wrapVictoryButtonAction(scene, function () {
        try {
          if (Logic.isAudioUsable(Logic.audioCorrect)) Logic.playAudioSafe(Logic.audioCorrect);
        } catch (eS) {}
        setMenuInputGuard(g, 520);
        htmlNavigateToScene(g, 'MainMenu');
      })
    );

    addVictoryHarnessBtn(
      btnRow,
      lblNext,
      rightMode === 'replay' ? '#7c3aed' : '#16a34a',
      wrapVictoryButtonAction(scene, function () {
        try {
          if (Logic.isAudioUsable(Logic.audioCorrect)) Logic.playAudioSafe(Logic.audioCorrect);
        } catch (eS) {}
        if (rightMode === 'continuara') {
          htmlNavigateToScene(g, 'EpilogoContinuaraScene');
        } else if (rightMode === 'next') {
          htmlNavigateToScene(g, 'PreLevelScene', { levelIndex: nextLevelIndex });
        } else {
          g.registry.set('starsTotal', 0);
          g.registry.set('starsPerLevel', {});
          Medals.resetMedalProgress(g.registry);
          Campaign.resetCampaignProgress(g.registry);
          htmlNavigateToScene(g, 'PreLevelScene', { levelIndex: 0 });
        }
      })
    );

    root.appendChild(btnRow);
    document.body.appendChild(root);
    applyVictoryHtmlBarLayout(root, scene, panel, viewportW, viewportH);

    if (scene.scale && typeof scene.scale.on === 'function') {
      var resizeHandler = function () {
        refreshVictoryHtmlBarLayout(scene, panel);
      };
      root._ctcResizeHandler = resizeHandler;
      root._ctcResizeScene = scene;
      scene.scale.on('resize', resizeHandler);
      scene.events.once('shutdown', function () {
        if (scene.scale && typeof scene.scale.off === 'function' && resizeHandler) {
          scene.scale.off('resize', resizeHandler);
        }
      });
    }
  }

  /**
   * Recuadro de código del álbum (victoria final, modo campaña).
   * @param {Phaser.Scene} scene
   * @param {{ cx: number, y: number, wrapW: number, reward: { code: string, sheetLabel: string } }} opts
   */
  function mountAlbumCodeVictoryBanner(scene, opts) {
    if (!scene || !opts || !opts.reward) return null;
    var cx = opts.cx;
    var y = opts.y;
    var wrapW = opts.wrapW || 340;
    var pad = 14;
    var sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    var serif = 'Georgia, "Times New Roman", serif';
    var title = scene.add
      .text(cx, y, 'Tu código — álbum Amigos de las Matemáticas', {
        fontFamily: serif,
        fontSize: '17px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: wrapW }
      })
      .setOrigin(0.5, 0)
      .setDepth(14);
    var sheet = scene.add
      .text(cx, y + title.height + 6, 'Lámina: ' + opts.reward.sheetLabel, {
        fontFamily: sans,
        fontSize: '14px',
        color: '#fde68a',
        fontStyle: 'bold',
        align: 'center'
      })
      .setOrigin(0.5, 0)
      .setDepth(14);
    var code = scene.add
      .text(cx, sheet.y + sheet.height + 10, opts.reward.code, {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '22px',
        color: '#1a1208',
        backgroundColor: '#fef9c3',
        padding: { x: 16, y: 10 },
        align: 'center'
      })
      .setOrigin(0.5, 0)
      .setDepth(14);
    var foot = scene.add
      .text(
        cx,
        code.y + code.height + 8,
        'Copiá o anotá el código para desbloquear la lámina en el álbum Amigos de las Matemáticas.',
        {
          fontFamily: sans,
          fontSize: '12px',
          color: '#e2e8f0',
          align: 'center',
          wordWrap: { width: wrapW },
          lineSpacing: 3
        }
      )
      .setOrigin(0.5, 0)
      .setDepth(14);
    var boxH = foot.y + foot.height - y + pad;
    var bg = scene.add
      .rectangle(cx, y + boxH / 2, wrapW + pad * 2, boxH, 0x0f172a, 0.88)
      .setDepth(13);
    bg.setStrokeStyle(2, 0xfbbf24, 0.9);
    return { bg: bg, nodes: [title, sheet, code, foot] };
  }

  function VictoryScene() {
    Phaser.Scene.call(this, { key: 'VictoryScene' });
  }
  VictoryScene.prototype = Object.create(Phaser.Scene.prototype);
  VictoryScene.prototype.constructor = VictoryScene;
  VictoryScene.prototype.create = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var self = this;
    if (this.input && this.input.manager) this.input.manager.enabled = true;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    var vicGrad = this.add.graphics();
    vicGrad.setScrollFactor(0);
    vicGrad.setDepth(-200);
    bindViewportGradient(this, vicGrad);
    Transition.fadeIn(this, VICTORY_TIMING.sceneFadeInMs);
    Particles.efectoConfeti(this);
    /**
     * Misma lógica que el fondo del menú / ilustración a pantalla: escala por altura del viewport.
     * Tu PNG nuevo tiene el mismo tamaño que ese fondo → encaje uniforme.
     */
    var panel;
    if (this.textures.exists('pantallaVictoria')) {
      panel = this.add.image(w / 2, h / 2, 'pantallaVictoria');
      layoutMainMenuBgImage(this, panel);
      bindFullscreenIllustrationResize(this, panel, function () {
        layoutMainMenuBgImage(self, panel);
      });
    } else {
      panel = this.add.rectangle(w / 2, h / 2, w, h, 0x14532d, 1);
    }
    Transition.slideIn(this, 'left', panel);
    if (panel && panel.active && panel.scene === this) {
      panel.setDepth(0);
      Anim.animPop(this, panel);
    }

    stopBgMusic(this, 200);
    stopAllGameplaySounds(this);
    playVictoryScreenMusic(this);

    var completed = this.registry.get('lastCompletedLevel');
    var fallbackVictoryIdx = this.registry.get('lastVictoryLevelIndex');
    function victoryLevelIndex(lv) {
      if (!lv || !levels || !levels.length) return -1;
      if (lv.id != null) {
        for (var vi = 0; vi < levels.length; vi++) {
          if (levels[vi].id === lv.id) return vi;
        }
      }
      return levels.indexOf(lv);
    }
    var completedIdx = victoryLevelIndex(completed);
    if (completedIdx < 0 && fallbackVictoryIdx != null) {
      completedIdx = Phaser.Math.Clamp(fallbackVictoryIdx, 0, levels.length - 1);
    }
    if (completedIdx < 0) completedIdx = 0;
    var completedLevelData = levels[completedIdx] || completed;
    var medalEntry = Medals.updateMedalForLevel(
      this.registry,
      completedIdx,
      completedLevelData
    );
    Campaign.initRegistry(this.registry);
    Campaign.markLevelCompleted(this.registry, completedIdx);
    var pendingAlbumReward = null;
    if (Campaign.canIssueAlbumCodeForLevel(this.registry, completedIdx)) {
      pendingAlbumReward = AlbumCodes.pickAlbumCodeForLevel(completedIdx);
      var albumKey = Campaign.albumCodeKeyForLevel(completedIdx);
      if (pendingAlbumReward && albumKey) Campaign.markAlbumCodeIssued(this.registry, albumKey);
    }
    var nextLevel = completed ? Logic.siguienteNivel(completed, levels) : null;
    var nextIdx = nextLevel ? victoryLevelIndex(nextLevel) : -1;
    if (nextIdx < 0 && nextLevel && nextLevel.id != null) {
      for (var nj = 0; nj < levels.length; nj++) {
        if (levels[nj].id === nextLevel.id) {
          nextIdx = nj;
          break;
        }
      }
    }
    if (nextLevel && nextIdx < 0) {
      nextIdx = Math.min(completedIdx + 1, levels.length - 1);
    }
    var esFinal = !nextLevel;

    /* Resumen: ⭐ del nivel (suma de tareas + cofre) y total de la partida. */
    var perLevelStars = this.registry.get('starsPerLevel') || {};
    var starsThisLevel =
      perLevelStars[completedIdx] != null ? perLevelStars[completedIdx] : 0;
    var totalStars = this.registry.get('starsTotal');
    if (totalStars == null) totalStars = 0;
    var maxLevelStars = Medals.computeMaxStarsForLevel(completedLevelData);
    var medalTier = medalEntry && medalEntry.tier != null ? medalEntry.tier : 0;
    var medalLabel = Medals.MEDAL_TIER_LABELS[medalTier] || Medals.MEDAL_TIER_LABELS[0];
    var medalLevelName = Medals.MEDAL_LEVEL_NAMES[completedIdx] || 'este nivel';
    var victoryPuente =
      completedLevelData && completedLevelData.victoryPuente && !esFinal
        ? String(completedLevelData.victoryPuente).trim()
        : '';
    var vLayout = computeVictoryMedalLayout(w, h, {
      esFinal: esFinal,
      hasBridge: !!victoryPuente,
      bridgeText: victoryPuente,
      panel: panel
    });

    var tMedal = VICTORY_TIMING.medalDelayMs;
    var tStag = VICTORY_TIMING.textStaggerMs;

    self.time.delayedCall(tMedal, function () {
      if (!self.sys || !self.sys.isActive()) return;
      Medals.showMedalGraphic(self, vLayout.medalX != null ? vLayout.medalX : vLayout.cx, vLayout.medalY, completedIdx, medalTier, {
        height: vLayout.medalH,
        depth: 12,
        pop: true,
        points: starsThisLevel
      });
    });

    var titleTxt = this.add
      .text(vLayout.cx, vLayout.titleY, 'Medalla de ' + medalLevelName, {
        fontFamily: 'Georgia, serif',
        fontSize: vLayout.titlePx + 'px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: vLayout.strokeTitle,
        align: 'center'
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    fadeInVictoryText(self, titleTxt, tMedal + 180);

    var tierTxt = this.add
      .text(vLayout.cx, vLayout.tierY, medalLabel, {
        fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
        fontSize: vLayout.subPx + 'px',
        color: '#fde68a',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: vLayout.strokeSub,
        align: 'center'
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    fadeInVictoryText(self, tierTxt, tMedal + 180 + tStag);

    var earnedTxt = this.add
      .text(
        vLayout.cx,
        vLayout.earnedY,
        'En este nivel: ' + starsThisLevel + ' / ' + maxLevelStars + ' ⭐',
        {
          fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
          fontSize: vLayout.subPx + 'px',
          color: '#fde68a',
          fontStyle: 'bold',
          stroke: '#1a0c08',
          strokeThickness: vLayout.strokeSub,
          align: 'center'
        }
      )
      .setOrigin(0.5, 0)
      .setDepth(11);
    fadeInVictoryText(self, earnedTxt, tMedal + 180 + tStag * 2);

    var totalTxt = this.add
      .text(vLayout.cx, vLayout.totalY, 'Total partida: ' + totalStars + ' ⭐', {
        fontFamily: 'system-ui, Arial, sans-serif',
        fontSize: vLayout.smallPx + 'px',
        color: '#fef3c7',
        fontStyle: 'bold',
        stroke: '#1a0c08',
        strokeThickness: vLayout.strokeSub,
        align: 'center'
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    fadeInVictoryText(self, totalTxt, tMedal + 180 + tStag * 3);

    if (victoryPuente) {
      self.time.delayedCall(VICTORY_TIMING.bridgeDelayMs, function () {
        if (!self.sys || !self.sys.isActive()) return;
        var bridgeYPos = vLayout.bridgeY != null ? vLayout.bridgeY : vLayout.earnedY - 8;
        var bridgeFs = vLayout.bridgeFs != null ? vLayout.bridgeFs : vLayout.subPx + 1;
        var bridgeWrap = vLayout.bridgeWrap != null ? vLayout.bridgeWrap : Math.min(w * 0.84, 360);
        var bridgeTxt = self.add
          .text(vLayout.cx, bridgeYPos, victoryPuente, {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: bridgeFs + 'px',
            color: '#1a1208',
            fontStyle: 'italic',
            align: 'center',
            wordWrap: { width: bridgeWrap },
            lineSpacing: 6,
            stroke: '#fffbeb',
            strokeThickness: 3
          })
          .setOrigin(0.5, 0.5)
          .setDepth(11);
        fadeInVictoryText(self, bridgeTxt, 0);
      });
    }

    /* Si era el último nivel: colección de las 4 medallas + título global. */
    if (esFinal) {
      var tituloFinal = '🎯 ¡Aventurero del plano!';
      if (totalStars >= 280) tituloFinal = '🏆 Maestro del plano';
      else if (totalStars >= 210) tituloFinal = '🥈 Cartógrafo experto';
      else if (totalStars >= 140) tituloFinal = '🥉 Explorador aprendiz';

      this.add
        .text(vLayout.cx, vLayout.finalMsgY, '¡Completaste los 4 niveles!', {
          fontFamily: 'Georgia, serif',
          fontSize: vLayout.titlePx + 'px',
          color: '#fef3c7',
          fontStyle: 'bold',
          stroke: '#1a0c08',
          strokeThickness: 5,
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(11);

      var gapMedal = Math.min(w * 0.17, 68);
      for (var mi = 0; mi < 4; mi++) {
        var ent = Medals.getMedalEntry(self.registry, mi);
        var tShow = ent ? ent.tier : -1;
        var mx = vLayout.cx + (mi - 1.5) * gapMedal;
        if (ent) {
          Medals.showMedalGraphic(self, mx, vLayout.finalRowY, mi, tShow, {
            height: vLayout.finalRowMedalH,
            depth: 12,
            pop: false,
            points: ent.stars
          });
        } else {
          self.add
            .text(mx, vLayout.finalRowY, '○', {
              fontSize: Math.round(vLayout.finalRowMedalH * 0.55) + 'px',
              color: '#94a3b8'
            })
            .setOrigin(0.5)
            .setDepth(11);
        }
      }

      this.add
        .text(vLayout.cx, vLayout.finalTitleY, tituloFinal, {
          fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
          fontSize: vLayout.finalTitlePx + 'px',
          color: '#fde68a',
          fontStyle: 'bold',
          stroke: '#1a0c08',
          strokeThickness: 5,
          align: 'center'
        })
        .setOrigin(0.5, 0)
        .setDepth(11);

      if (
        (Campaign.isFreeMode(self.registry) || !Campaign.isAlbumCodeEligible(self.registry)) &&
        !Campaign.wasAlbumCodeIssued(self.registry, 'car') &&
        !Campaign.wasAlbumCodeIssued(self.registry, 'des')
      ) {
        self.add
          .text(
            vLayout.cx,
            vLayout.finalTitleY + vLayout.finalTitlePx + 14,
            'Modo libre: no se entregaron códigos CAR / DES. Para obtenerlos, elegí «Campaña» en el menú y completá los pares de mapas.',
            {
              fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
              fontSize: Math.max(11, vLayout.smallPx - 1) + 'px',
              color: '#cbd5e1',
              fontStyle: 'italic',
              align: 'center',
              wordWrap: { width: Math.min(w * 0.88, 380) },
              lineSpacing: 4
            }
          )
          .setOrigin(0.5, 0)
          .setDepth(11);
      }
    }

    var rightLabel = 'Siguiente nivel';
    var rightMode = 'replay';
    if (completedIdx === 1) {
      /* Fin de la Parte 1 (Las Montañas): en vez de pasar al Desierto,
         cerrar con la narración «Continuará…» (continuara.mp3). */
      rightLabel = 'Continuará…';
      rightMode = 'continuara';
    } else if (nextLevel && nextIdx >= 0) {
      rightLabel = 'Siguiente nivel';
      rightMode = 'next';
    } else if (esFinal) {
      rightLabel = 'Jugar de nuevo';
      rightMode = 'replay';
    } else {
      rightLabel = 'Jugar de nuevo';
      rightMode = 'replay';
    }

    var navIdxForNext =
      nextIdx >= 0 ? nextIdx : Math.min(completedIdx + 1, levels.length - 1);

    /**
     * Botones al final: da tiempo a leer medalla, estrellas y nota de Gadget.
     */
    var albumHintForBar = '';
    if (!pendingAlbumReward) {
      if (Campaign.isFreeMode(self.registry)) {
        albumHintForBar =
          '¡Muy buena práctica, seguí así! Si querés el código del álbum, jugá en modo Campaña.';
      } else if (completedIdx === 1 && !Campaign.isLevelCompleted(self.registry, 0)) {
        albumHintForBar =
          'Completá «El Bosque» en Campaña para obtener el código CAR del álbum.';
      }
    }

    self.time.delayedCall(VICTORY_TIMING.buttonsDelayMs, function () {
      if (!self.sys || !self.sys.isActive() || !panel || !panel.active) return;
      mountVictoryStyleBar(self, w, h, panel, {
        completedLevelIndex: completedIdx,
        nextLevelIndex: navIdxForNext,
        rightMode: rightMode,
        rightLabel: rightLabel,
        albumReward: pendingAlbumReward,
        albumHint: albumHintForBar
      });
    });
    this.events.once('shutdown', function () {
      stopVictoryScreenMusic(self);
      destroyVictoryHtmlBar();
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });
  };

  function DefeatScene() {
    Phaser.Scene.call(this, { key: 'DefeatScene' });
  }
  DefeatScene.prototype = Object.create(Phaser.Scene.prototype);
  DefeatScene.prototype.constructor = DefeatScene;
  DefeatScene.prototype.create = function () {
    var w = this.cameras.main.width;
    var h = this.cameras.main.height;
    var self = this;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    var defGrad = this.add.graphics();
    defGrad.setScrollFactor(0);
    defGrad.setDepth(-200);
    bindViewportGradient(this, defGrad);
    Transition.fadeIn(this, 320);
    Particles.efectoError(this, w / 2, h * 0.35);
    var panel;
    var hasDefeatArt = this.textures.exists('pantallaDerrota');
    if (hasDefeatArt) {
      panel = this.add.image(w / 2, h / 2, 'pantallaDerrota');
      layoutMainMenuBgImage(this, panel);
      bindFullscreenIllustrationResize(this, panel, function () {
        layoutMainMenuBgImage(self, panel);
        if (self._layoutDefeatArtButtons) self._layoutDefeatArtButtons();
      });
    } else {
      panel = this.add.rectangle(w / 2, h / 2, w * 0.88, h * 0.82, 0x450a0a, 1);
    }
    Transition.slideIn(this, 'right', panel);
    if (panel && panel.active && panel.scene === this) {
      panel.setDepth(0);
      Anim.animPop(this, panel);
    }

    stopBgMusic(this, 200);
    stopAllGameplaySounds(this);
    playDefeatScreenMusic(this);

    var levelIndex = this.registry.get('defeatLevelIndex');
    if (levelIndex == null) levelIndex = 0;

    if (hasDefeatArt) {
      mountDefeatArtButtons(self, panel, levelIndex);
    } else {
      var motivo = this.registry.get('defeatMotivo');
      var motivoTxt = '';
      if (motivo === 'sinPasos') {
        motivoTxt = 'Agotaste tus movimientos restantes.';
      } else if (motivo === 'sinEstrellas') {
        motivoTxt = 'Perdiste todas las estrellas por imprudencias.';
      }
      if (motivoTxt) {
        this.add
          .text(w / 2, h * 0.54, motivoTxt, {
            fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
            fontSize: '17px',
            color: '#fecaca',
            align: 'center',
            wordWrap: { width: Math.min(w * 0.85, 420) }
          })
          .setOrigin(0.5)
          .setDepth(3);
      }

      var retry = this.add
        .text(w / 2, h * 0.66, 'Reintentar', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
          backgroundColor: '#ca8a04',
          padding: { x: 24, y: 12 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      ButtonFx.bindAnimatedButton(
        self,
        retry,
        wrapDefeatButtonAction(self, function () {
          restartCurrentLevel(self, levelIndex, { viaPreLevel: false, resetLevelStars: true });
        })
      );

      var menu = this.add
        .text(w / 2, h * 0.78, 'Volver al menú', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
          backgroundColor: '#2563eb',
          padding: { x: 24, y: 12 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      ButtonFx.bindAnimatedButton(
        self,
        menu,
        wrapDefeatButtonAction(self, function () {
          forceGoMainMenu(self);
        })
      );
    }

    this.events.once('shutdown', function () {
      stopDefeatScreenMusic(self);
      destroyDefeatArtButtons(self);
      if (self.tweens) self.tweens.killAll();
      if (self.time) self.time.removeAllEvents();
    });
  };

  /**
   * Panel HTML para saltar a cualquier escena sin jugar (TEMPORAL: quitar al publicar).
   * Por defecto siempre visible si CTC_SCENE_DEBUG_ALWAYS (desarrollo). Ocultar:
   * localStorage.setItem('ctc_ensayo_pantallas','0'). También: ?debug=1, ?ensayo=1 o ctc_ensayo_pantallas=1.
   */
  var CTC_SCENE_DEBUG_ALWAYS = false;

  function installSceneDebugHarness(game) {
    if (typeof document === 'undefined' || !game) return;
    if (document.getElementById('ctc-scene-debug-root')) return;
    var loc = typeof location !== 'undefined' ? location.search : '';
    var hiddenByLs =
      typeof localStorage !== 'undefined' && localStorage.getItem('ctc_ensayo_pantallas') === '0';
    var fromLs =
      typeof localStorage !== 'undefined' && localStorage.getItem('ctc_ensayo_pantallas') === '1';
    var fromUrl = /\b(?:\?|&)debug=1\b/.test(loc) || /\b(?:\?|&)ensayo=1\b/.test(loc);
    var showPanel =
      !hiddenByLs && (CTC_SCENE_DEBUG_ALWAYS || fromLs || fromUrl);
    if (!showPanel) return;

    function readLevelIndex(selectEl) {
      var v = parseInt(selectEl.value, 10);
      if (isNaN(v)) return 0;
      return Phaser.Math.Clamp(v, 0, Math.max(0, levels.length - 1));
    }

    function seedVictoryMid() {
      game.registry.set('lastCompletedLevel', levels[0]);
      game.registry.set('lastVictoryLevelIndex', 0);
      game.registry.set('lastGameEarned', 30);
      game.registry.set('starsTotal', 85);
      game.registry.set('starsPerLevel', { 0: 85 });
      game.registry.set('medalsPerLevel', {
        0: { tier: 2, stars: 85, maxStars: Medals.computeMaxStarsForLevel(levels[0]) }
      });
    }
    function seedVictoryFinal() {
      game.registry.set('lastCompletedLevel', levels[levels.length - 1]);
      game.registry.set('lastGameEarned', 15);
      game.registry.set('starsTotal', 180);
    }

    var root = document.createElement('div');
    root.id = 'ctc-scene-debug-root';
    root.style.cssText =
      'position:fixed;bottom:10px;right:10px;z-index:100000;font:13px system-ui,sans-serif;max-width:min(96vw,280px);pointer-events:auto;';
    root.innerHTML =
      '<button type="button" id="ctc-debug-toggle" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid #0f766e;background:#14b8a6;color:#fff;font-weight:600;cursor:pointer;">Ensayo ▾ pantallas</button>' +
      '<div id="ctc-debug-menu" style="display:none;margin-top:8px;padding:10px;background:rgba(15,23,42,0.92);border-radius:12px;border:1px solid #334155;box-shadow:0 8px 24px rgba(0,0,0,0.35);">' +
      '<div style="color:#94a3b8;font-size:11px;margin-bottom:8px;">Nivel para partida / pre / post / derrota:</div>' +
      '<select id="ctc-debug-level" style="width:100%;margin-bottom:10px;padding:6px;border-radius:8px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;"></select>' +
      '<div id="ctc-debug-buttons" style="display:flex;flex-direction:column;gap:6px;"></div>' +
      '<div style="color:#64748b;font-size:10px;margin-top:10px;line-height:1.35;">Ocultar este panel: <code style="background:#1e293b;padding:2px 4px;border-radius:4px;">localStorage.setItem(\'ctc_ensayo_pantallas\',\'0\')</code> + recarga. Publicar: pon <code style="background:#1e293b;padding:2px 4px;border-radius:4px;">CTC_SCENE_DEBUG_ALWAYS = false</code> en game.js.</div>' +
      '</div>';

    var sel = root.querySelector('#ctc-debug-level');
    for (var li = 0; li < levels.length; li++) {
      var opt = document.createElement('option');
      opt.value = String(li);
      opt.textContent = (li + 1) + '. ' + (levels[li].name || 'Nivel ' + (li + 1));
      sel.appendChild(opt);
    }

    var btnCol = root.querySelector('#ctc-debug-buttons');
    function addBtn(label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        'padding:8px 10px;border-radius:8px;border:1px solid #475569;background:#334155;color:#f1f5f9;cursor:pointer;text-align:left;font-size:13px;';
      b.addEventListener('click', fn);
      btnCol.appendChild(b);
    }

    addBtn('Menú principal', function () {
      htmlNavigateToScene(game, 'MainMenu');
    });
    addBtn('Pre-nivel (briefing)', function () {
      htmlNavigateToScene(game, 'PreLevelScene', { levelIndex: readLevelIndex(sel) });
    });
    addBtn('Partida (mapa)', function () {
      htmlNavigateToScene(game, 'GameScene', { levelIndex: readLevelIndex(sel) });
    });
    addBtn('Post-nivel (repaso)', function () {
      htmlNavigateToScene(game, 'PostLevelScene', { levelIndex: readLevelIndex(sel) });
    });
    addBtn('Pausa (sobre partida)', function () {
      var idx = readLevelIndex(sel);
      htmlNavigateToScene(game, 'GameScene', { levelIndex: idx });
      game.time.delayedCall(90, function () {
        if (!game.scene.isActive('GameScene')) return;
        game.scene.pause('GameScene');
        game.scene.launch('PauseScene', { gameKey: 'GameScene' });
      });
    });
    addBtn('Victoria (queda otro nivel)', function () {
      seedVictoryMid();
      htmlNavigateToScene(game, 'VictoryScene');
    });
    addBtn('Victoria (último nivel)', function () {
      seedVictoryFinal();
      htmlNavigateToScene(game, 'VictoryScene');
    });
    addBtn('Derrota', function () {
      game.registry.set('defeatLevelIndex', readLevelIndex(sel));
      htmlNavigateToScene(game, 'DefeatScene');
    });

    var toggle = root.querySelector('#ctc-debug-toggle');
    var menu = root.querySelector('#ctc-debug-menu');
    toggle.addEventListener('click', function () {
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    document.body.appendChild(root);
  }

  function startGame() {
    try {
      if (typeof Phaser === 'undefined') {
        console.error('Phaser no está cargado.');
        var diag = document.getElementById('boot-diagnostics');
        if (diag) {
          diag.classList.add('visible');
          diag.textContent += 'Phaser no está definido. Revisa la carga del CDN.\n';
        }
        return;
      }
      var parentEl = document.getElementById('phaser-game');
      if (!parentEl) {
        console.error('No existe el elemento #phaser-game.');
        return;
      }
      var rw = Math.max(320, Math.floor(parentEl.clientWidth || window.innerWidth));
      var rh = Math.max(240, Math.floor(parentEl.clientHeight || window.innerHeight));
      var game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: parentEl,
        transparent: true,
        backgroundColor: 'rgba(0,0,0,0)',
        render: {
          antialias: true,
          roundPixels: true
        },
        width: rw,
        height: rh,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.NO_CENTER
        },
        input: {
          activePointers: 2,
          touch: { capture: true }
        },
        scene: [
          BootScene,
          MainMenu,
          IntroPrologueScene,
          PreLevelScene,
          GameScene,
          PostLevelScene,
          PauseScene,
          VictoryScene,
          DefeatScene,
          EpilogoContinuaraScene
        ]
      });
      window.__CTC_DEBUG_GAME__ = game;
      installSceneDebugHarness(game);
      console.log('[Caza Tesoro] Phaser.Game iniciado correctamente.');
    } catch (err) {
      console.error('[Caza Tesoro] Error al crear Phaser.Game:', err);
      var d = document.getElementById('boot-diagnostics');
      if (d) {
        d.classList.add('visible');
        d.textContent += (err && err.message ? err.message : String(err)) + '\n';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame);
  } else {
    startGame();
  }
})();
