/** Compatibilidad: inanición y envejecimiento viven en managers/ProcessManager.ts. */
export {
  detectStarvation,
  floodSpec,
  FLOOD_DURATION,
  forceStarvationScenario,
  forceStarvationScenario as launchStarvationScenario,
} from './managers/ProcessManager';
