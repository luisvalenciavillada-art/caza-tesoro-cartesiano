/**
 * Orden canónico del Nivel 2 (Montañas): hitos de mapa y metas en secuencia.
 * Si cambias `levels.js`, actualiza esta tabla y ejecuta `npm run validate:missions`.
 *
 * Flujo jugable (sin saltos narrativos):
 * 1–6 · Sir y sombrero en (−3, 4).
 * 7 · Pregunta virus (sigue en (−3, 4)).
 * 8 · Ir a la recta x = −5 (pregunta sobre columna).
 * 9 · Vecino al Secuaz (−7, 5) — diálogo de persecución.
 * 10 · Misma vecindad — interrogatorio (no exige moverse si ya estás).
 * 11–14 · Disco (−4, 5), pregunta y, suplica, magia (sigue en (−4, 5)).
 * 15 · Sir activa límite de pasos (sigue en (−4, 5)).
 * 16 · (0, 3) en el eje.
 * 17 · Cofre (0, 10).
 */

export var MONTANAS_TASK_COUNT = 18;

/** Metas que deben cumplirse en orden (índice 0 = primera tarea del nivel). */
export var MONTANAS_META_CHAIN = [
  { i: 7, note: 'Tras pregunta moscas', expect: { tipo: 'casilla', x: -3, y: 4 } },
  { i: 8, note: 'Recta antes que Secuaz', expect: { tipo: 'rectaX', x: -5 } },
  { i: 9, note: 'Acercarse al Secuaz', expect: { tipo: 'vecino', x: -7, y: 5 } },
  { i: 10, note: 'Interrogatorio', expect: { tipo: 'vecino', x: -7, y: 5 } },
  { i: 11, note: 'Disco', expect: { tipo: 'casilla', x: -4, y: 5 } },
  { i: 12, note: 'Pregunta eje y', expect: { tipo: 'casilla', x: -4, y: 5 } },
  { i: 13, note: 'Suplica Secuaz', expect: { tipo: 'casilla', x: -4, y: 5 } },
  { i: 14, note: 'Magia', expect: { tipo: 'casilla', x: -4, y: 5 } },
  { i: 15, note: 'Inicio límite pasos', expect: { tipo: 'casilla', x: -4, y: 5 } },
  { i: 16, note: 'Waypoint eje', expect: { tipo: 'casilla', x: 0, y: 3 } },
  { i: 17, note: 'Cofre', expect: { tipo: 'cofre' } }
];

function metaMatches(actual, expect) {
  if (!actual || !expect) return false;
  if (actual.tipo !== expect.tipo) return false;
  if (expect.x != null && actual.x !== expect.x) return false;
  if (expect.y != null && actual.y !== expect.y) return false;
  return true;
}

/** Comprueba que las metas 7–17 coinciden con la cadena canónica. */
export function assertMontanasMetaOrder(tareas) {
  var errors = [];
  for (var k = 0; k < MONTANAS_META_CHAIN.length; k++) {
    var row = MONTANAS_META_CHAIN[k];
    var task = tareas[row.i];
    if (!task || !task.meta) {
      errors.push('Falta meta en tarea índice ' + row.i + ' (' + row.note + ').');
      continue;
    }
    if (!metaMatches(task.meta, row.expect)) {
      errors.push(
        'Tarea índice ' +
          row.i +
          ' (' +
          row.note +
          '): meta distinta a la canónica. Esperado ' +
          JSON.stringify(row.expect) +
          ', hay ' +
          JSON.stringify(task.meta)
      );
    }
  }
  return errors;
}
