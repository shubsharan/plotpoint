/**
 * Engine event types for tracking story execution.
 */
export type EngineEventType =
  | 'NODE_ENTERED'
  | 'NODE_EXITED'
  | 'EDGE_TRAVERSED'
  | 'STATE_UPDATED'
  | 'INVENTORY_CHANGED'
  | 'STORY_STARTED'
  | 'STORY_COMPLETED'
  | 'STORY_RESTARTED';

/**
 * Engine event structure.
 */
export interface EngineEvent {
  type: EngineEventType;
  timestamp: number;
  nodeId?: string;
  edgeId?: string;
  data?: Record<string, unknown>;
}

/**
 * Event listener function type.
 */
export type EventListener = (event: EngineEvent) => void;

/**
 * Event emitter interface for subscribing to and emitting events.
 */
export interface EventEmitter {
  on: (type: EngineEventType, listener: EventListener) => () => void; // Returns unsubscribe function
  once: (type: EngineEventType, listener: EventListener) => void;
  emit: (event: EngineEvent) => void;
  off: (type: EngineEventType, listener: EventListener) => void;
  clear: () => void;
}

/**
 * Create an event emitter for tracking story execution events.
 * Uses closure pattern to maintain listener registry.
 */
export function createEventEmitter(): EventEmitter {
  // Map of event types to arrays of listeners
  const listeners = new Map<EngineEventType, EventListener[]>();

  function on(type: EngineEventType, listener: EventListener): () => void {
    if (!listeners.has(type)) {
      listeners.set(type, []);
    }

    const typeListeners = listeners.get(type)!;
    typeListeners.push(listener);

    // Return unsubscribe function
    return () => off(type, listener);
  }

  function once(type: EngineEventType, listener: EventListener): void {
    const wrappedListener: EventListener = (event) => {
      listener(event);
      off(type, wrappedListener);
    };

    on(type, wrappedListener);
  }

  function emit(event: EngineEvent): void {
    const typeListeners = listeners.get(event.type);
    if (!typeListeners) return;

    // Call all listeners for this event type
    for (const listener of typeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(`Error in event listener for ${event.type}:`, error);
      }
    }
  }

  function off(type: EngineEventType, listener: EventListener): void {
    const typeListeners = listeners.get(type);
    if (!typeListeners) return;

    const index = typeListeners.indexOf(listener);
    if (index !== -1) {
      typeListeners.splice(index, 1);
    }
  }

  function clear(): void {
    listeners.clear();
  }

  return {
    on,
    once,
    emit,
    off,
    clear,
  };
}

/**
 * Create a logging event listener that logs all events to console.
 * Useful for debugging story execution.
 */
export function createLoggingListener(prefix: string = '[Engine Event]'): EventListener {
  return (event: EngineEvent) => {
    console.log(`${prefix} [${event.type}]`, {
      timestamp: new Date(event.timestamp).toISOString(),
      nodeId: event.nodeId,
      edgeId: event.edgeId,
      data: event.data,
    });
  };
}

/**
 * Create an event collector that stores all events in an array.
 * Useful for testing and analysis.
 */
export function createEventCollector(): {
  listener: EventListener;
  getEvents: () => EngineEvent[];
  clear: () => void;
} {
  const events: EngineEvent[] = [];

  return {
    listener: (event: EngineEvent) => {
      events.push(event);
    },
    getEvents: () => [...events],
    clear: () => {
      events.length = 0;
    },
  };
}

/**
 * Create a filtered event listener that only fires for specific event types.
 */
export function createFilteredListener(
  types: EngineEventType[],
  listener: EventListener
): EventListener {
  const typeSet = new Set(types);
  return (event: EngineEvent) => {
    if (typeSet.has(event.type)) {
      listener(event);
    }
  };
}
