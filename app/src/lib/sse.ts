import type { SseEventMap, SseEventName } from "./types";

const encoder = new TextEncoder();

export function encodeSseEvent<N extends SseEventName>(
  name: N,
  payload: SseEventMap[N],
): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/** Typed emitter over a ReadableStream controller; no-ops after close. */
export function sseEmitter(controller: ReadableStreamDefaultController<Uint8Array>) {
  let closed = false;
  return {
    emit<N extends SseEventName>(name: N, payload: SseEventMap[N]) {
      if (closed) return;
      try {
        controller.enqueue(encodeSseEvent(name, payload));
      } catch {
        closed = true; // client went away
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  };
}

export type SseEmitter = ReturnType<typeof sseEmitter>;
