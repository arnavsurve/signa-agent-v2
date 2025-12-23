"use client";

import { FormEvent, KeyboardEvent, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ComposerProps {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  onStop: () => void;
}

export function Composer({
  input,
  onChange,
  onSubmit,
  isLoading,
  onStop,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        const form = e.currentTarget.form;
        if (form) {
          form.requestSubmit();
        }
      }
    }
  };

  return (
    <form onSubmit={onSubmit} className="relative">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask about people, signals, or network insights..."
        disabled={isLoading}
        rows={1}
        className="w-full resize-none rounded-lg border bg-background px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />

      <div className="absolute right-2 bottom-2">
        {isLoading ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onStop}
            className="h-8 w-8"
          >
            <Square className="h-4 w-4" />
            <span className="sr-only">Stop</span>
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            disabled={!input.trim()}
            className="h-8 w-8"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        )}
      </div>
    </form>
  );
}
