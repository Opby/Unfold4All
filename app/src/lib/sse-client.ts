import type { ChatRequest, SseEventMap, SseEventName } from "./types";

export type SseHandlers = {
  [N in SseEventName]?: (payload: SseEventMap[N]) => void;
} & {
  /** Transport-level failure (network error, non-2xx, malformed body). */
  onTransportError?: (message: string) => void;
};

/**
 * POST the chat request and dispatch typed SSE events. EventSource can't POST,
 * so we parse the stream by hand. Returns an aborter.
 */
export function streamChat(req: ChatRequest, handlers: SseHandlers): () => void {
  const controller = new AbortController();

  (async () => {
    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch {
      if (!controller.signal.aborted) {
        handlers.onTransportError?.("Could not reach the server.");
      }
      return;
    }
    if (!response.ok || !response.body) {
      handlers.onTransportError?.(`Server error (${response.status}).`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          dispatch(buffer.slice(0, sep), handlers);
          buffer = buffer.slice(sep + 2);
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        handlers.onTransportError?.("Connection interrupted.");
      }
    }
  })();

  return () => controller.abort();
}

function dispatch(frame: string, handlers: SseHandlers) {
  let event: string | null = null;
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!event || !data) return;
  try {
    const payload = JSON.parse(data);
    handlers[event as SseEventName]?.(payload);
  } catch {
    // Malformed frame — skip rather than kill the stream.
  }
}
