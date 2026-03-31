import { loadRuntime } from './load-runtime.js';
import { startGame } from './start-game.js';
import { submitAction } from './submit-action.js';
import type { Engine, EnginePorts } from './types.js';

export const createEngine = (ports: EnginePorts): Engine => ({
  startGame: (input) => startGame(ports, input),
  loadRuntime: (input) => loadRuntime(ports, input),
  submitAction: (input) => submitAction(ports, input),
});
