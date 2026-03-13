import { useState, useRef, useEffect } from "react";
import { SendHorizonal } from "lucide-react";
import { cn } from "../../lib/utils";

export function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, [value]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 transition-colors focus-within:border-primary/30">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about this research..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
          value.trim() && !disabled
            ? "bg-primary text-white active:scale-90"
            : "text-muted-foreground opacity-40",
        )}
      >
        <SendHorizonal className="h-4 w-4" />
      </button>
    </div>
  );
}
