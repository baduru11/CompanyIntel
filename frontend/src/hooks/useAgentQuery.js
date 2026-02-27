import { useState, useCallback } from "react";
import { getApiUrl } from "../lib/api";

export function useAgentQuery() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("explore");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [events, setEvents] = useState([]);

  const submit = useCallback(async (q, m) => {
    setQuery(q);
    setMode(m);
    setResult(null);
    setError(null);
    setIsLoading(true);
    setEvents([]);

    try {
      // POST to check cache — response is either JSON (cache hit) or SSE stream
      const resp = await fetch(getApiUrl("/api/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, mode: m }),
      });

      const contentType = resp.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        // Cached result returned directly as JSON
        const data = await resp.json();
        setResult(data);
        setIsLoading(false);
        return;
      }

      // SSE stream via fetch + ReadableStream (POST can't use EventSource)
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              if (data.event === "status") {
                setEvents((prev) => [...prev, data]);
              } else if (data.event === "complete") {
                setResult(data);
                setIsLoading(false);
              } else if (data.event === "error") {
                setError(data.message || "Unknown error");
                setIsLoading(false);
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }

      // If stream ended without a complete/error event, mark as done
      setIsLoading(false);
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  }, []);

  return {
    query,
    mode,
    result,
    error,
    isLoading,
    events,
    submit,
  };
}
