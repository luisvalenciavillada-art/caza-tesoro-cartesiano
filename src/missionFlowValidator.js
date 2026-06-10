/**
 * Validación del guion de misiones: estructura, coherencia y reglas que el motor asume.
 * Uso:
 *   node scripts/validate-missions.mjs
 * En el juego (navegador): ?ctcValidateMissions=1 & ?ctcMissionRuntime=1 & ?ctcMissionStrict=1
 */

import { assertMontanasMetaOrder } from './missionOrderMontanas.js';
import { simulateMontanasFromTask7 } from './missionSimulateMontanas.js';

export var MISSION_META_TIPOS = ['cofre', 'casilla', 'vecino', 'eje', 'rectaX'];

/** Debe coincidir con game.js (niebla Secuaz, waypoint Sir/magia). */
export var GAME_LEVEL2_SECUAZ_FOG_FIRST = 8;
export var GAME_LEVEL2_SECUAZ_FOG_LAST = 13;
export var GAME_LEVEL2_WAYPOINT_FIRST = 15;
export var GAME_LEVEL2_WAYPOINT_LAST = 16;

function push(arr, levelId, taskIdx, msg, isWarn) {
  var taskPart = taskIdx < 0 ? '' : ', tarea ' + (taskIdx + 1);
  var prefix = '[Nivel ' + (levelId != null ? levelId : '?') + taskPart + '] ';
  arr.push({ isWarn: !!isWarn, text: prefix + msg });
}

function collectAvisoBodies(task) {
  var av = task.aviso;
  if (!av) return [];
  if (av.paginas && av.paginas.length) return av.paginas.slice();
  if (av.texto) return [av.texto];
  return [];
}

function normalizeSnippet(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .toLowerCase();
}

export function validateTask(level, task, taskIdx, tareas) {
  var errors = [];
  var warnings = [];
  var id = level && level.id;

  if (!task || typeof task !== 'object') {
    push(errors, id, taskIdx, 'Tarea vacía o inválida.');
    return { errors: errors, warnings: warnings };
  }

  if (!task.desc || typeof task.desc !== 'string') {
    push(errors, id, taskIdx, 'Falta `desc` (texto corto) en la tarea.');
  }

  var meta = task.meta;
  if (!meta || typeof meta !== 'object') {
    push(errors, id, taskIdx, 'Falta `meta`.');
  } else {
    if (MISSION_META_TIPOS.indexOf(meta.tipo) < 0) {
      push(errors, id, taskIdx, 'meta.tipo desconocido para el motor: «' + meta.tipo + '».');
    }
    if (meta.tipo === 'casilla' || meta.tipo === 'vecino') {
      if (meta.x == null || meta.y == null) {
        push(errors, id, taskIdx, 'meta casilla/vecino requiere x e y.');
      }
    }
    if (meta.tipo === 'rectaX' && meta.x == null) {
      push(errors, id, taskIdx, 'meta rectaX requiere x.');
    }
    if (meta.tipo === 'eje') {
      if (meta.eje !== 'x' && meta.eje !== 'y') {
        push(errors, id, taskIdx, 'meta eje requiere eje «x» o «y».');
      }
    }
  }

  var tienePregunta = !!(task.pregunta && typeof task.pregunta === 'object');
  var tieneAviso = !!(task.aviso && typeof task.aviso === 'object');

  if (!tienePregunta && !tieneAviso) {
    /* accion sola (raro) */
    if (!task.accion) {
      push(errors, id, taskIdx, 'La tarea no tiene aviso ni pregunta ni acción.');
    }
  }

  if (tienePregunta) {
    var p = task.pregunta;
    if (!p.texto || typeof p.texto !== 'string') {
      push(errors, id, taskIdx, 'pregunta sin texto.');
    }
    if (!Array.isArray(p.opciones) || p.opciones.length < 2) {
      push(errors, id, taskIdx, 'pregunta.opciones debe ser un array con al menos 2 ítems.');
    } else {
      var c = p.correcta;
      if (typeof c !== 'number' || c < 0 || c >= p.opciones.length) {
        push(errors, id, taskIdx, 'pregunta.correcta fuera de rango.');
      }
    }
  }

  if (tieneAviso) {
    var a = task.aviso;
    var bodies = collectAvisoBodies(task);
    if (!a.titulo && !bodies.length) {
      push(errors, id, taskIdx, 'aviso sin título ni texto ni paginas.');
    }
    if (a.paginas) {
      if (!Array.isArray(a.paginas) || !a.paginas.length) {
        push(errors, id, taskIdx, 'aviso.paginas vacío.');
      } else {
        for (var pi = 0; pi < a.paginas.length; pi++) {
          if (!a.paginas[pi] || typeof a.paginas[pi] !== 'string') {
            push(errors, id, taskIdx, 'aviso.paginas[' + pi + '] inválida.');
          }
        }
        if (a.nieblaEnPagina != null) {
          if (a.nieblaEnPagina < 0 || a.nieblaEnPagina >= a.paginas.length) {
            push(errors, id, taskIdx, 'nieblaEnPagina fuera de rango de paginas.');
          }
        }
        if (a.cambioSprite && a.cambioSprite.enPagina != null) {
          if (
            a.cambioSprite.enPagina < 0 ||
            a.cambioSprite.enPagina >= a.paginas.length
          ) {
            push(errors, id, taskIdx, 'cambioSprite.enPagina fuera de rango.');
          }
        }
        if (a.sonidoPagina && a.sonidoPagina.enPagina != null) {
          if (
            a.sonidoPagina.enPagina < 0 ||
            a.sonidoPagina.enPagina >= a.paginas.length
          ) {
            push(errors, id, taskIdx, 'sonidoPagina.enPagina fuera de rango.');
          }
        }
      }
    }
  }

  if (task.encadenarSiguiente) {
    if (taskIdx >= tareas.length - 1) {
      push(errors, id, taskIdx, 'encadenarSiguiente en la última tarea: no hay siguiente.');
    }
  }

  return { errors: errors, warnings: warnings };
}

/** Reglas que enlazan datos con game.js (niebla, waypoint, orden pedagógico Montañas). */
function validateLevel2Montanas(level, tareas, errors, warnings) {
  var id = level.id;
  if (tareas.length !== 18) {
    push(
      errors,
      id,
      -1,
      'Nivel 2: se esperaban 18 tareas (índices 0–17); hay ' + tareas.length + '. Actualiza game.js y la niebla si cambias el guion.'
    );
    return;
  }

  var orden = assertMontanasMetaOrder(tareas);
  for (var oi = 0; oi < orden.length; oi++) {
    push(errors, id, -1, orden[oi]);
  }

  var t14 = tareas[14];
  if (t14 && t14.accion) {
    var ac = t14.accion;
    var list = Array.isArray(ac) ? ac : [ac];
    var hasMagia = list.some(function (s) {
      return s && s.tipo === 'magiaFlash';
    });
    if (!hasMagia) {
      push(errors, id, 14, 'La tarea de magia debe incluir accion con tipo magiaFlash.');
    }
  } else {
    push(errors, id, 14, 'Falta tarea de magia (accion con magiaFlash) en el índice 14.');
  }
  if (!t14 || !t14.desc || t14.desc.toLowerCase().indexOf('fulmina') < 0) {
    push(
      warnings,
      id,
      14,
      'Tarea 15: conviene que desc mencione la magia («fulmina») para alinear guion y código.',
      true
    );
  }

  var t15 = tareas[15];
  if (!t15 || !t15.accion || t15.accion.tipo !== 'iniciarLimitePasos') {
    push(errors, id, 15, 'Tarea 16 debe tener accion.iniciarLimitePasos (Sir cuenta pasos).');
  }

  var sim = simulateMontanasFromTask7(level);
  if (!sim.ok) {
    for (var si = 0; si < sim.errors.length; si++) {
      push(errors, id, -1, 'Simulación de recorrido (tareas 8–17): ' + sim.errors[si]);
    }
  }
}

/** Diálogos casi idénticos entre tareas distintas (riesgo de repetición cansina). */
function validateDuplicateDialogSnippets(level, tareas, warnings) {
  var id = level.id;
  var seen = Object.create(null);
  for (var i = 0; i < tareas.length; i++) {
    var task = tareas[i];
    var bodies = [];
    if (task.pregunta && task.pregunta.texto) bodies.push(task.pregunta.texto);
    bodies = bodies.concat(collectAvisoBodies(task));
    for (var b = 0; b < bodies.length; b++) {
      var key = normalizeSnippet(bodies[b]);
      if (key.length < 24) continue;
      if (seen[key]) {
        push(
          warnings,
          id,
          i,
          'Texto de diálogo muy parecido a la tarea ' +
            (seen[key] + 1) +
            ' (revisar repetición entre misiones).',
          true
        );
      } else {
        seen[key] = i;
      }
    }
  }
}

export function validateLevel(level) {
  var errors = [];
  var warnings = [];
  if (!level || typeof level !== 'object') {
    return {
      ok: false,
      errors: [{ isWarn: false, text: 'Nivel nulo.' }],
      warnings: []
    };
  }

  if (!level.id) {
    errors.push({ isWarn: false, text: '[Nivel] Falta id.' });
  }

  var tareas = level.tareas;
  if (!Array.isArray(tareas) || !tareas.length) {
    errors.push({ isWarn: false, text: '[Nivel ' + level.id + '] Sin tareas.' });
    return { ok: false, errors: errors, warnings: warnings };
  }

  for (var i = 0; i < tareas.length; i++) {
    var vr = validateTask(level, tareas[i], i, tareas);
    errors = errors.concat(vr.errors);
    warnings = warnings.concat(vr.warnings);
  }

  validateDuplicateDialogSnippets(level, tareas, warnings);

  if (level.id === 2) {
    validateLevel2Montanas(level, tareas, errors, warnings);
  }

  var ok = !errors.length;
  return { ok: ok, errors: errors, warnings: warnings };
}

export function validateAllLevels(levels) {
  var allErrors = [];
  var allWarnings = [];
  var ok = true;
  if (!Array.isArray(levels)) {
    return { ok: false, errors: [{ text: 'levels no es un array', isWarn: false }], warnings: [] };
  }
  for (var i = 0; i < levels.length; i++) {
    var r = validateLevel(levels[i]);
    if (!r.ok) ok = false;
    allErrors = allErrors.concat(r.errors);
    allWarnings = allWarnings.concat(r.warnings);
  }
  return { ok: ok, errors: allErrors, warnings: allWarnings };
}

export function formatValidationReport(result) {
  var lines = [];
  if (result.ok && !result.warnings.length) {
    lines.push('✓ Misiones: sin errores ni avisos.');
    return lines.join('\n');
  }
  if (!result.ok) {
    lines.push('✗ ERRORES (' + result.errors.length + '):');
    result.errors.forEach(function (e) {
      lines.push('  · ' + e.text);
    });
  }
  if (result.warnings.length) {
    lines.push('△ AVISOS (' + result.warnings.length + '):');
    result.warnings.forEach(function (w) {
      lines.push('  · ' + w.text);
    });
  }
  return lines.join('\n');
}

/* === Tiempo de ejecución (Phaser): duplicar diálogo sin avanzar === */

function urlHasParam(name) {
  try {
    if (typeof location === 'undefined') return false;
    return new RegExp('[?&]' + name + '=1(?:&|$)').test(location.search || '');
  } catch (eU) {
    return false;
  }
}

export function missionRuntimeShouldValidateStatic() {
  return urlHasParam('ctcValidateMissions');
}

export function missionRuntimeGuardsEnabled() {
  return urlHasParam('ctcMissionRuntime') || urlHasParam('ctcMissionStrict');
}

export function missionRuntimeStrict() {
  return urlHasParam('ctcMissionStrict');
}

/**
 * Llamar desde GameScene.create tras asignar nivel.
 * @param {import('phaser').Scene} scene
 */
export function missionRuntimeInitScene(scene) {
  if (!missionRuntimeGuardsEnabled() && !missionRuntimeShouldValidateStatic()) return;
  scene._ctcFlowEpoch = 0;
  scene._ctcLastDialogFingerprint = null;
  scene._ctcLastDialogEpoch = null;
}

/**
 * Tras incrementar _taskIndex con éxito.
 */
export function missionRuntimeOnTaskAdvanced(scene) {
  if (!missionRuntimeGuardsEnabled()) return;
  scene._ctcFlowEpoch = (scene._ctcFlowEpoch || 0) + 1;
  scene._ctcLastDialogFingerprint = null;
  scene._ctcLastDialogEpoch = null;
}

/**
 * Al abrir aviso o pregunta (una vez por apertura de panel).
 * @param {'notice'|'question'} kind
 */
export function missionRuntimeOnDialogOpen(scene, task, kind) {
  if (!missionRuntimeGuardsEnabled() || !scene || !task) return;
  var fp =
    scene._taskIndex +
    '|' +
    kind +
    '|' +
    (task.desc || '') +
    '|' +
    (kind === 'question' && task.pregunta ? String(task.pregunta.texto).slice(0, 40) : '');
  var epoch = scene._ctcFlowEpoch || 0;
  if (
    scene._ctcLastDialogFingerprint === fp &&
    scene._ctcLastDialogEpoch === epoch
  ) {
    var msg =
      '[CTC Misión] Mismo diálogo abierto dos veces sin avanzar de tarea (índice ' +
      scene._taskIndex +
      '). Revisa latch / tryRecover / encadenado.';
    console.error(msg);
    if (missionRuntimeStrict()) {
      throw new Error(msg);
    }
  }
  scene._ctcLastDialogFingerprint = fp;
  scene._ctcLastDialogEpoch = epoch;
}

/**
 * Invariantes ligeras cada frame (opcional).
 */
export function missionRuntimeTick(scene) {
  if (!missionRuntimeGuardsEnabled() || !scene) return;
  if (scene._taskModalActive && !scene._taskModalRefs) {
    var msg =
      '[CTC Misión] _taskModalActive sin _taskModalRefs (modal fantasma).';
    console.error(msg);
    if (missionRuntimeStrict()) throw new Error(msg);
  }
}
