/**
 * Simulación de movimiento (BFS) en el nivel Montañas con las mismas reglas de colisión
 * que tryMove en game.js (objetos no decorativos bloquean).
 */

import { fueraDelMapa } from './logic.js';

var NON_BLOCKING = {
  dinamita: true,
  binocular: true,
  sombrero: true,
  sultanRastreo: true
};

function blockingPositions(objetos) {
  var blocked = Object.create(null);
  (objetos || []).forEach(function (o) {
    if (!o || NON_BLOCKING[o.tipo]) return;
    blocked[o.x + ',' + o.y] = true;
  });
  return blocked;
}

function isBlocked(x, y, blocked) {
  return !!blocked[x + ',' + y];
}

export function metaSatisfiedMontanas(meta, pos, tesoro) {
  if (!meta) return false;
  switch (meta.tipo) {
    case 'cofre':
      return pos.x === tesoro.x && pos.y === tesoro.y;
    case 'casilla':
      return pos.x === meta.x && pos.y === meta.y;
    case 'vecino': {
      var dx = Math.abs(pos.x - meta.x);
      var dy = Math.abs(pos.y - meta.y);
      return Math.max(dx, dy) <= 1;
    }
    case 'rectaX':
      return meta.x != null && pos.x === meta.x;
    default:
      return false;
  }
}

function neighbors(pos, level, blocked) {
  var out = [];
  var dirs = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 }
  ];
  for (var d = 0; d < dirs.length; d++) {
    var nx = pos.x + dirs[d].x;
    var ny = pos.y + dirs[d].y;
    var np = { x: nx, y: ny };
    if (fueraDelMapa(np, level)) continue;
    if (isBlocked(nx, ny, blocked)) continue;
    out.push(np);
  }
  return out;
}

/**
 * Encuentra camino mínimo hasta una casilla que cumpla goal(pos).
 * @returns {{ path: {x:number,y:number}[] } | { error: string }}
 */
export function bfsToGoal(level, start, blocked, goal) {
  var key = function (p) {
    return p.x + ',' + p.y;
  };
  if (goal(start)) return { path: [start] };
  var q = [start];
  var seen = Object.create(null);
  var parent = Object.create(null);
  seen[key(start)] = true;
  var qi = 0;
  while (qi < q.length) {
    var cur = q[qi++];
    var ns = neighbors(cur, level, blocked);
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i];
      var k = key(n);
      if (seen[k]) continue;
      seen[k] = true;
      parent[k] = cur;
      if (goal(n)) {
        var path = [n];
        var b = n;
        while (key(b) !== key(start)) {
          b = parent[key(b)];
          path.unshift(b);
        }
        return { path: path };
      }
      q.push(n);
    }
  }
  return { error: 'Sin camino desde (' + start.x + ',' + start.y + ')' };
}

/**
 * Quita enemigos fulminados por la magia (misma lista que volarObjeto en levels).
 */
export function objetosTrasMagia(objetos) {
  var remove = {
    '-7,5': true,
    '-7,4': true,
    '-6,7': true
  };
  return (objetos || []).filter(function (o) {
    return !remove[o.x + ',' + o.y];
  });
}

/**
 * Simula la cadena 7→17: posición tras la tarea 7 es (−3, 4).
 * @returns {{ ok: boolean, segments: object[], errors: string[] }}
 */
export function simulateMontanasFromTask7(level) {
  var errors = [];
  var segments = [];
  var tareas = level.tareas;
  var tesoro = level.tesoro || { x: 0, y: 10 };
  var pos = { x: -3, y: 4 };

  var steps = [
    { idx: 8, useObjs: 'preMagia' },
    { idx: 9, useObjs: 'preMagia' },
    { idx: 10, useObjs: 'preMagia' },
    { idx: 11, useObjs: 'preMagia' },
    { idx: 12, useObjs: 'preMagia' },
    { idx: 13, useObjs: 'preMagia' },
    { idx: 14, useObjs: 'preMagia' },
    { idx: 15, useObjs: 'preMagia' },
    { idx: 16, useObjs: 'postMagia' },
    { idx: 17, useObjs: 'postMagia' }
  ];

  var objsFull = level.objetos || [];
  var objsPost = objetosTrasMagia(objsFull);

  for (var s = 0; s < steps.length; s++) {
    var step = steps[s];
    var task = tareas[step.idx];
    var meta = task && task.meta;
    var blocked =
      step.useObjs === 'postMagia'
        ? blockingPositions(objsPost)
        : blockingPositions(objsFull);

    if (metaSatisfiedMontanas(meta, pos, tesoro)) {
      segments.push({
        taskIndex: step.idx,
        desc: task.desc,
        pathLen: 0,
        from: { x: pos.x, y: pos.y },
        to: { x: pos.x, y: pos.y }
      });
      continue;
    }

    var goal = function (p) {
      return metaSatisfiedMontanas(meta, p, tesoro);
    };
    var res = bfsToGoal(level, pos, blocked, goal);
    if (res.error) {
      errors.push(
        'Tarea índice ' +
          step.idx +
          ' («' +
          (task && task.desc) +
          '»): ' +
          res.error +
          ' con objetos ' +
          step.useObjs
      );
      return { ok: false, segments: segments, errors: errors };
    }
    var path = res.path;
    pos = path[path.length - 1];
    segments.push({
      taskIndex: step.idx,
      desc: task.desc,
      pathLen: path.length - 1,
      from: path[0],
      to: pos
    });
  }

  return { ok: errors.length === 0, segments: segments, errors: errors };
}
