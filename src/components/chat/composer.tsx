"use client";

import { FormEvent, KeyboardEvent, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
    <form onSubmit={onSubmit}>
      <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-2.5 flex items-end gap-3">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about people, signals, or network insights..."
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center gap-2">
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onStop}
              className="h-9 w-9 rounded-full"
            >
              <Square className="h-4 w-4" />
              <span className="sr-only">Stop</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              variant="secondary"
              disabled={!input.trim()}
              className="h-9 w-9 rounded-full"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
