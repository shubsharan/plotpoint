import { loadRuntime } from './load-runtime.js';
import { performBlockAction } from './perform-block-action.js';
import { startGame } from './start-game.js';
import { traverseEdge } from './traverse-edge.js';
import type { Engine, EnginePorts } from './types.js';

export const createEngine = (ports: EnginePorts): Engine => ({
  startGame: (input) => startGame(ports, input),
  loadRuntime: (input) => loadRuntime(ports, input),
  performBlockAction: (input) => performBlockAction(ports, input),
  traverseEdge: (input) => traverseEdge(ports, input),
});
