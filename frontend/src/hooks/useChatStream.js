import { useState, useRef, useCallback } from "react";
import { getApiUrl } from "../lib/api";

export function useChatStream(reportId) {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const abortRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (message, { scope = "current", companyName = "" } = {}) => {
      if (!message.trim() || isStreaming) return;

      const userMsg = { role: "user", content: message };
      const assistantMsg = {
        role: "assistant",
        content: "",
        sources: [],
        webSearch: false,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);
      cancelledRef.current = false;

      const history = messagesRef.current
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-10);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const resp = await fetch(getApiUrl("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            report_id: reportId,
            scope,
            history,
            company_name: companyName,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error(`Chat request failed: ${resp.status}`);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";

        while (!cancelledRef.current) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              let data;
              try {
                data = JSON.parse(line.slice(5).trim());
              } catch {
                continue;
              }

              if (currentEvent === "token" || data.type === "token") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = { ...updated[updated.length - 1] };
                  last.content += data.content;
                  updated[updated.length - 1] = last;
                  return updated;
                });
              } else if (
                currentEvent === "retrieval" ||
                data.type === "retrieval"
              ) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = { ...updated[updated.length - 1] };
                  last.webSearch = data.web_search;
                  updated[updated.length - 1] = last;
                  return updated;
                });
              } else if (
                currentEvent === "sources" ||
                data.type === "sources"
              ) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = { ...updated[updated.length - 1] };
                  last.sources = data.sources || [];
                  updated[updated.length - 1] = last;
                  return updated;
                });
              } else if (currentEvent === "error" || data.type === "error") {
                setError(data.message);
              }
            }
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message);
        }
      } finally {
        setIsStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0) {
            const last = { ...updated[updated.length - 1] };
            last.isStreaming = false;
            updated[updated.length - 1] = last;
          }
          return updated;
        });
      }
    },
    [reportId, isStreaming],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isStreaming, error, sendMessage, cancel, clearMessages };
}
