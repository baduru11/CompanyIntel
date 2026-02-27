import { useState, useEffect, useRef, useCallback } from "react";

export function useSSE(url, { enabled = false, onEvent, onComplete, onError } = {}) {
  const [status, setStatus] = useState("idle");
  const [events, setEvents] = useState([]);
  const sourceRef = useRef(null);
  const timeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (!url || !enabled) return;
    setStatus("connecting");

    const source = new EventSource(url);
    sourceRef.current = source;

    const resetTimeout = () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setStatus("error");
        source.close();
        onError?.("Agent may be stalled — no events for 60 seconds");
      }, 60000);
    };

    source.onopen = () => {
      setStatus("connected");
      resetTimeout();
    };

    source.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      setEvents((prev) => [...prev, data]);
      onEvent?.(data);
      resetTimeout();
    });

    source.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data);
      setStatus("idle");
      clearTimeout(timeoutRef.current);
      source.close();
      onComplete?.(data);
    });

    source.addEventListener("error", (e) => {
      try {
        if (e.data) {
          const data = JSON.parse(e.data);
          onError?.(data.message);
        }
      } catch {}
      setStatus("error");
      clearTimeout(timeoutRef.current);
      source.close();
    });

    source.addEventListener("heartbeat", () => resetTimeout());

    source.onerror = () => {
      setStatus("error");
      clearTimeout(timeoutRef.current);
      source.close();
    };
  }, [url, enabled]);

  useEffect(() => {
    connect();
    return () => {
      sourceRef.current?.close();
      clearTimeout(timeoutRef.current);
    };
  }, [connect]);

  const reset = useCallback(() => {
    setEvents([]);
    setStatus("idle");
  }, []);

  return { status, events, reset };
}
