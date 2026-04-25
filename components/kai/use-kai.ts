"use client";

import { useCallback, useRef, useState } from "react";
import { parseKaiResponse, type KaiUserProfile } from "@/lib/kai-prompt";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  structuredData?: KaiUserProfile | null;
  isStreaming?: boolean;
}

export function useKai() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [latestProfile, setLatestProfile] = useState<KaiUserProfile | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isLoading) {
        return;
      }

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const cleanedText = userText.trim();
      const history = messages.map((message) => ({
        role: message.role,
        content: message.content.replace(/---DATA_OUTPUT_START---[\s\S]*?---DATA_OUTPUT_END---/, "").trim(),
      }));
      const recentHistory = history.filter((message) => message.content).slice(-6);
      const memory = latestProfile?.summary?.trim() || null;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: cleanedText,
        timestamp: new Date(),
      };

      const assistantId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: true,
        },
      ]);
      setIsLoading(true);

      try {
        const response = await fetch("/api/kai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [...recentHistory, { role: "user", content: cleanedText }],
            memory,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("Stream failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const rawEvent of events) {
            for (const line of rawEvent.split("\n")) {
              if (!line.startsWith("data: ")) {
                continue;
              }

              const payload = line.slice(6).trim();
              if (!payload || payload === "[DONE]") {
                continue;
              }

              const parsed = JSON.parse(payload) as { text?: string };
              if (parsed.text) {
                fullText += parsed.text;
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === assistantId ? { ...message, content: fullText } : message,
                  ),
                );
              }
            }
          }

          if (done) {
            break;
          }
        }

        const { conversationText, structuredData } = parseKaiResponse(fullText);

        if (structuredData) {
          setLatestProfile(structuredData);
        }

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: conversationText || fullText,
                  structuredData,
                  isStreaming: false,
                }
              : message,
          ),
        );
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: "Something went wrong on this turn. Try again in a moment.",
                  isStreaming: false,
                }
              : message,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, latestProfile, messages],
  );

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setLatestProfile(null);
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    latestProfile,
    sendMessage,
    resetConversation,
  };
}
