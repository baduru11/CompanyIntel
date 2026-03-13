import { useState, useRef, useEffect } from "react";
import { X, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useChatStream } from "../../hooks/useChatStream";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ScopeToggle } from "./ScopeToggle";

export function ChatPanel({ reportId, companyName, isOpen, onToggle }) {
  const [scope, setScope] = useState("current");
  const scrollRef = useRef(null);
  const { messages, isStreaming, error, sendMessage, clearMessages } =
    useChatStream(reportId);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handleSend = (message) => {
    sendMessage(message, { scope, companyName });
  };

  return (
    <>
      {/* Floating popup */}
      <div
        className={cn(
          "fixed bottom-20 right-6 z-50 flex flex-col rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/40 transition-all duration-300 ease-out origin-bottom-right",
          "glass-strong",
          "w-[calc(100vw-2rem)] sm:w-[400px] h-[min(520px,calc(100vh-8rem))]",
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">
              Research Chat
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onToggle}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              title="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scope Toggle */}
        <div className="px-4 py-2 shrink-0">
          <ScopeToggle scope={scope} onScopeChange={setScope} />
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 min-h-0"
        >
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-primary/10 p-3">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Ask about this research
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Chat with the raw data collected during the deep dive
                </p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} index={i} />
          ))}
          {error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/[0.06] px-4 py-3 shrink-0">
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </div>
      </div>

      {/* Toggle button — always visible */}
      <button
        onClick={onToggle}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-200",
          "active:scale-95",
          isOpen
            ? "h-11 w-11 bg-white/[0.08] border border-white/[0.1] text-foreground hover:bg-white/[0.12]"
            : "h-12 w-12 bg-primary text-white shadow-primary/20 hover:scale-105 hover:shadow-xl hover:shadow-primary/30",
        )}
        title={isOpen ? "Close chat" : "Ask about this research"}
      >
        {isOpen ? (
          <X className="h-4 w-4" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
      </button>
    </>
  );
}
