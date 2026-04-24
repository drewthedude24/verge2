import { NextRequest } from "next/server";
import { KAI_SYSTEM_PROMPT } from "@/lib/kai-prompt";

type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function GET() {
  return Response.json({
    liveModelConfigured: Boolean(GEMINI_API_KEY.trim()),
    model: GEMINI_API_KEY.trim() ? GEMINI_MODEL : null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages?: Message[] } = await request.json();

    if (!Array.isArray(messages)) {
      return new Response("Invalid messages payload", { status: 400 });
    }

    const text = await generateKaiReply(messages);
    return streamText(text);
  } catch (error) {
    console.error("[Kai API] Error:", error);
    return streamText(buildFallbackReply([]));
  }
}

async function generateKaiReply(messages: Message[]) {
  if (!GEMINI_API_KEY) {
    return buildFallbackReply(messages);
  }

  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: KAI_SYSTEM_PROMPT }],
          },
          contents,
          generationConfig: {
            temperature: 0.75,
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Gemini failed with status ${response.status}. ${details.slice(0, 220)}`);
    }

    const payload = await response.json();
    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim() || "";

    return text || buildFallbackReply(messages);
  } catch (error) {
    console.error("[Kai/Gemini] Falling back:", error);
    return buildFallbackReply(messages);
  }
}

function buildFallbackReply(messages: Message[]) {
  const lastUserMessage = messages.filter((message) => message.role === "user").at(-1)?.content || "";
  const lower = lastUserMessage.toLowerCase();

  if (!lastUserMessage) {
    return "Tell me what your week looks like right now. Start with anything fixed, anything urgent, and when your energy tends to be best.";
  }

  if (/\b(test|quiz|exam|deadline|due|interview|presentation)\b/i.test(lower)) {
    return `I can already hear the pressure points in that. Before I lay out a plan, what parts of the week are fixed and what time of day do you usually think best?`;
  }

  if (/\b(class|work|shift|meeting|call|practice|gym|workout)\b/i.test(lower)) {
    return `That gives me some good anchors already. What deadline or high-stakes task matters most this week, and when do you usually have your sharpest focus?`;
  }

  return `The live model is unavailable for this turn, but I can still shape the plan with you. Give me your fixed commitments, biggest deadline, and your best focus window.`;
}

function streamText(text: string) {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      for (const chunk of chunkText(text)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        await delay(18);
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function chunkText(text: string) {
  const words = String(text || "")
    .split(/(\s+)/)
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    current += word;
    if (current.length >= 24 || /\n/.test(word)) {
      chunks.push(current);
      current = "";
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [text];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
