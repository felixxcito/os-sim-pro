/** Compatibilidad: la detección de interbloqueo vive en managers/ResourceManager.ts. */
export {
  detectDeadlock,
  detectDeadlockMatrix,
  forceDeadlockScenario,
  forceDeadlockScenario as launchDeadlockScenario,
  waitForGraph,
  type MatrixAnalysis,
  type WaitEdge,
} from './managers/ResourceManager';
