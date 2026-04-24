// app/api/kai/route.ts
// Streams Kai's response using the Gemini API (free tier).
// Swap GEMINI_MODEL for any Gemini model — gemini-2.0-flash is fast and free.
// When you're ready for Claude, swap this file for the Anthropic version.

import { KAI_SYSTEM_PROMPT } from "@/lib/kai-prompt";
import { NextRequest } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

type Role = "user" | "assistant";
interface Message { role: Role; content: string; }

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages payload", { status: 400 });
    }

    // Gemini uses "user" / "model" — map "assistant" → "model"
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: KAI_SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!geminiRes.ok || !geminiRes.body) {
      const err = await geminiRes.text();
      console.error("[Kai/Gemini] Error:", err);
      return new Response("Gemini request failed", { status: 502 });
    }

    // Re-stream Gemini's SSE response in the format use-kai.ts expects:
    // data: {"text": "..."}\n\n  →  data: [DONE]\n\n
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = geminiRes.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Each SSE line looks like: data: {...json...}
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;

            try {
              const parsed = JSON.parse(raw);
              const text =
                parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              if (text) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text })}\n\n`
                  )
                );
              }
            } catch {
              // skip malformed chunk
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[Kai API] Error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
