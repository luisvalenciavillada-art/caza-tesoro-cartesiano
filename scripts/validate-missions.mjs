/**
 * Valida guiones de misiones (levels.js) sin arrancar el juego.
 *
 *   node scripts/validate-missions.mjs
 */
globalThis.window = globalThis;

const { validateAllLevels, formatValidationReport } = await import(
  new URL('../src/missionFlowValidator.js', import.meta.url)
);
const { simulateMontanasFromTask7 } = await import(
  new URL('../src/missionSimulateMontanas.js', import.meta.url)
);
const { levels } = await import(new URL('../src/levels.js', import.meta.url));

const result = validateAllLevels(levels);
console.log(formatValidationReport(result));
var l2 = levels.find(function (L) {
  return L.id === 2;
});
if (l2 && result.ok) {
  var sim = simulateMontanasFromTask7(l2);
  console.log('\nSimulación Montañas (BFS tareas 8–17, desde (−3,4)):');
  sim.segments.forEach(function (seg) {
    console.log(
      '  · Tarea ' + (seg.taskIndex + 1) + ': ' + seg.pathLen + ' pasos — ' + seg.desc
    );
  });
}
if (!result.ok) {
  process.exitCode = 1;
}
