"use client";

import { UIMessage } from "@ai-sdk/react";
import { Message } from "./message";

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  return (
    <div className="space-y-6">
      {messages.map((message, index) => (
        <Message
          key={message.id}
          message={message}
          isLast={index === messages.length - 1}
          isLoading={isLoading && index === messages.length - 1}
        />
      ))}
    </div>
  );
}
