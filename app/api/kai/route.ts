import { NextRequest } from "next/server";
import { KAI_SYSTEM_PROMPT } from "@/lib/kai-prompt";

type Role = "user" | "assistant";
type ProviderName = "gemini" | "openrouter" | "groq" | "cerebras";

interface Message {
  role: Role;
  content: string;
}

interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const MAX_RETRIES = 3;
const RESPONSE_TEMPERATURE = 0.7;
const RESPONSE_MAX_TOKENS = 2200;
const MEMORY_CHAR_LIMIT = 600;
const HISTORY_TURN_LIMIT = 7;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim() || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() || "";
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY?.trim() || "";
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL?.trim() || "qwen-3-235b-a22b-instruct-2507";

const LLM_PROVIDER = process.env.LLM_PROVIDER?.trim().toLowerCase() || "auto";

export async function GET() {
  const provider = getConfiguredProvider();

  return Response.json({
    liveModelConfigured: Boolean(provider),
    provider: provider?.provider ?? null,
    model: provider?.model ?? null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { messages, memory }: { messages?: Message[]; memory?: string | null } = await request.json();

    if (!Array.isArray(messages)) {
      return new Response("Invalid messages payload", { status: 400 });
    }

    const provider = getConfiguredProvider();
    const text = await generateKaiReply(messages, memory, provider);
    return streamText(text);
  } catch (error) {
    console.error("[Kai API] Error:", error);
    return streamText(buildFallbackReply([], error instanceof Error ? error : undefined));
  }
}

async function generateKaiReply(messages: Message[], memory: string | null | undefined, provider: ProviderConfig | null) {
  if (!provider) {
    return buildFallbackReply(messages);
  }

  try {
    if (provider.provider === "gemini") {
      const contents = buildGeminiContents(messages, memory);
      const text = await generateGeminiReplyWithRetry(provider, contents);
      return text || buildFallbackReply(messages, undefined, provider);
    }

    const promptMessages = buildOpenAICompatibleMessages(messages, memory);
    const text = await generateOpenAICompatibleReplyWithRetry(provider, promptMessages);
    return text || buildFallbackReply(messages, undefined, provider);
  } catch (error) {
    console.error(`[Kai/${formatProviderName(provider.provider)}] Falling back:`, error);
    return buildFallbackReply(messages, error instanceof Error ? error : undefined, provider);
  }
}

function getConfiguredProvider(): ProviderConfig | null {
  if (LLM_PROVIDER !== "auto") {
    return createProviderConfig(LLM_PROVIDER);
  }

  return (
    createProviderConfig("cerebras") ||
    createProviderConfig("groq") ||
    createProviderConfig("openrouter") ||
    createProviderConfig("gemini")
  );
}

function createProviderConfig(providerName: string): ProviderConfig | null {
  switch (providerName) {
    case "gemini":
      return GEMINI_API_KEY
        ? {
            provider: "gemini",
            apiKey: GEMINI_API_KEY,
            model: GEMINI_MODEL,
          }
        : null;
    case "openrouter":
      return OPENROUTER_API_KEY
        ? {
            provider: "openrouter",
            apiKey: OPENROUTER_API_KEY,
            model: OPENROUTER_MODEL,
            baseUrl: "https://openrouter.ai/api/v1",
          }
        : null;
    case "groq":
      return GROQ_API_KEY
        ? {
            provider: "groq",
            apiKey: GROQ_API_KEY,
            model: GROQ_MODEL,
            baseUrl: "https://api.groq.com/openai/v1",
          }
        : null;
    case "cerebras":
      return CEREBRAS_API_KEY
        ? {
            provider: "cerebras",
            apiKey: CEREBRAS_API_KEY,
            model: CEREBRAS_MODEL,
            baseUrl: "https://api.cerebras.ai/v1",
          }
        : null;
    default:
      return null;
  }
}

function buildGeminiContents(messages: Message[], memory?: string | null) {
  const contents: GeminiContent[] = [];
  const trimmedMemory = memory?.trim().slice(0, MEMORY_CHAR_LIMIT) || "";

  if (trimmedMemory) {
    contents.push({
      role: "user",
      parts: [{ text: `Known context from earlier in this session:\n${trimmedMemory}` }],
    });
  }

  for (const message of messages.slice(-HISTORY_TURN_LIMIT)) {
    if (!message.content?.trim()) {
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }

  return contents;
}

function buildOpenAICompatibleMessages(messages: Message[], memory?: string | null) {
  const promptMessages: OpenAICompatibleMessage[] = [
    {
      role: "system",
      content: KAI_SYSTEM_PROMPT,
    },
  ];

  const trimmedMemory = memory?.trim().slice(0, MEMORY_CHAR_LIMIT) || "";
  if (trimmedMemory) {
    promptMessages.push({
      role: "user",
      content: `Known context from earlier in this session:\n${trimmedMemory}`,
    });
  }

  for (const message of messages.slice(-HISTORY_TURN_LIMIT)) {
    if (!message.content?.trim()) {
      continue;
    }

    promptMessages.push({
      role: message.role,
      content: message.content,
    });
  }

  return promptMessages;
}

function buildFallbackReply(messages: Message[], error?: Error, provider?: ProviderConfig | null) {
  const providerName = provider ? formatProviderName(provider.provider) : "The live model";
  const lastUserMessage = messages.filter((message) => message.role === "user").at(-1)?.content || "";
  const lower = lastUserMessage.toLowerCase();

  if (error && /\b429\b/.test(error.message)) {
    return `${providerName} hit the current request quota for this API key, so Kai had to fall back on this turn. Give it a minute and try again, or switch to a key with higher free limits.`;
  }

  if (error && (/\b503\b/.test(error.message) || /\bUNAVAILABLE\b/i.test(error.message))) {
    return `${providerName} is under heavy demand right now, so Kai had to fall back on this turn. Wait a few seconds and send that again.`;
  }

  if (!lastUserMessage) {
    return "Tell me what your week looks like right now. Start with anything fixed, anything urgent, and when your energy tends to be best.";
  }

  if (/\b(test|quiz|exam|deadline|due|interview|presentation)\b/i.test(lower)) {
    return "I can already hear the pressure points in that. Before I lay out a plan, what parts of the week are fixed and what time of day do you usually think best?";
  }

  if (/\b(class|work|shift|meeting|call|practice|gym|workout)\b/i.test(lower)) {
    return "That gives me some good anchors already. What deadline or high-stakes task matters most this week, and when do you usually have your sharpest focus?";
  }

  return "The live model is unavailable for this turn, but I can still shape the plan with you. Give me your fixed commitments, biggest deadline, and your best focus window.";
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

async function generateGeminiReplyWithRetry(provider: ProviderConfig, contents: GeminiContent[]) {
  return retryProviderRequest(provider, () => generateGeminiReply(provider, contents));
}

async function generateOpenAICompatibleReplyWithRetry(provider: ProviderConfig, messages: OpenAICompatibleMessage[]) {
  return retryProviderRequest(provider, () => generateOpenAICompatibleReply(provider, messages));
}

async function retryProviderRequest(provider: ProviderConfig, task: () => Promise<string>) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = isRetryableProviderError(lastError);

      if (!retryable || attempt === MAX_RETRIES) {
        throw lastError;
      }

      const backoffMs = 450 * 2 ** attempt + Math.floor(Math.random() * 250);
      console.warn(
        `[Kai/${formatProviderName(provider.provider)}] Retry ${attempt + 1}/${MAX_RETRIES} after transient failure: ${lastError.message}`,
      );
      await delay(backoffMs);
    }
  }

  throw lastError ?? new Error("The model provider failed without an error message.");
}

async function generateGeminiReply(provider: ProviderConfig, contents: GeminiContent[]) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": provider.apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: KAI_SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
          temperature: RESPONSE_TEMPERATURE,
          maxOutputTokens: RESPONSE_MAX_TOKENS,
        },
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`${formatProviderName(provider.provider)} failed with status ${response.status}. ${details.slice(0, 220)}`);
  }

  const payload = await response.json();
  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim() || ""
  );
}

async function generateOpenAICompatibleReply(provider: ProviderConfig, messages: OpenAICompatibleMessage[]) {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      ...(provider.provider === "openrouter"
        ? {
            "HTTP-Referer": "https://github.com/CodedMed/Verge",
            "X-OpenRouter-Title": "Verge",
          }
        : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: false,
      temperature: RESPONSE_TEMPERATURE,
      max_tokens: RESPONSE_MAX_TOKENS,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`${formatProviderName(provider.provider)} failed with status ${response.status}. ${details.slice(0, 220)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part: { type?: string; text?: string }) => (part?.type === "text" ? part.text || "" : ""))
      .join("")
      .trim();
  }

  return "";
}

function isRetryableProviderError(error: Error) {
  return /\b(429|500|502|503|504)\b/.test(error.message) || /\bUNAVAILABLE\b/i.test(error.message);
}

function formatProviderName(provider: ProviderName) {
  switch (provider) {
    case "gemini":
      return "Gemini";
    case "openrouter":
      return "OpenRouter";
    case "groq":
      return "Groq";
    case "cerebras":
      return "Cerebras";
  }
}
