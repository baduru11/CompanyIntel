import { cn } from "../../lib/utils";
import MarkdownProse from "../shared/MarkdownProse";
import { Globe, ExternalLink } from "lucide-react";

export function ChatMessage({ message, index }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full animate-init animate-chat-fade-up",
        isUser ? "justify-end" : "justify-start",
      )}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary/20 text-foreground"
            : "glass border border-white/[0.06]",
        )}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <>
            {message.isStreaming && !message.content && <TypingIndicator />}
            {message.content && (
              <MarkdownProse content={message.content} citations={[]} />
            )}
            {message.webSearch && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" />
                <span>Searched the web</span>
              </div>
            )}
            {message.sources?.length > 0 && !message.isStreaming && (
              <div className="mt-3 border-t border-white/[0.06] pt-2">
                <p className="mb-1 text-xs text-muted-foreground">Sources</p>
                <div className="flex flex-wrap gap-1.5">
                  {message.sources.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-xs text-blue-400 transition-colors hover:bg-white/[0.08]"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {(() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return url; } })()}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-chat-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
