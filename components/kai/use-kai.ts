// components/kai/use-kai.ts
"use client";

import { useState, useCallback, useRef } from "react";
import { parseKaiResponse, KaiUserProfile } from "@/lib/kai-prompt";

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

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || isLoading) return;

    // Abort any existing stream
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userText.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    try {
      // Build messages array for the API (history + new user message)
      const apiMessages = [
        ...messages.map((m) => ({
          role: m.role,
          // Strip structured data block from history — not needed in API context
          content: m.content.replace(
            /---DATA_OUTPUT_START---[\s\S]*?---DATA_OUTPUT_END---/,
            ""
          ).trim(),
        })),
        { role: "user" as const, content: userText.trim() },
      ];

      const res = await fetch("/api/kai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullText }
                      : m
                  )
                );
              }
            } catch {
              // skip malformed chunk
            }
          }
        }
      }

      // Parse out structured data from completed response
      const { conversationText, structuredData } = parseKaiResponse(fullText);

      if (structuredData) {
        setLatestProfile(structuredData);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: conversationText,
                structuredData,
                isStreaming: false,
              }
            : m
        )
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Something went wrong — try again in a moment.",
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setLatestProfile(null);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, latestProfile, sendMessage, resetConversation };
}
