import { loadSession } from './commands/load-session.js';
import { startSession } from './commands/start-session.js';
import { submitAction } from './commands/submit-action.js';
import { traverse } from './commands/traverse.js';
import type { Engine, EnginePorts } from './types.js';

export const createEngine = (ports: EnginePorts): Engine => ({
  startSession: (input) => startSession(ports, input),
  loadSession: (input) => loadSession(ports, input),
  submitAction: (input) => submitAction(ports, input),
  traverse: (input) => traverse(ports, input),
});
