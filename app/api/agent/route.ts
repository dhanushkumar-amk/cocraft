import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createUIMessageStreamResponse, toUIMessageStream, streamText, convertToModelMessages, type LanguageModel, type UIMessage } from "ai";
import { agentToolDefs } from "@/lib/agent-tools";
import { PROMPT_LIMIT_ERROR } from "@/lib/plan-limits";
import { checkUser } from "@/actions/check-user";
import { canAccessWorkspace } from "@/lib/workspace-access";
import { getPromptUsage, getWorkspaceOwnerId, recordPrompt } from "@/lib/billing";

const SYSTEM_PROMPT = `You are Cocraft's workspace agent. A workspace has two surfaces: a canvas (an infinite whiteboard for diagrams) and a doc (a rich-text document). For edit requests, change them by calling tools. For questions asking what a selected component does, explain its role and connections in plain language without changing the workspace. Never use em dashes in your replies.

Choosing where to work:
- If the user names a surface ("in the doc", "just the diagram", "only the canvas"), change only that surface.
- Otherwise decide from the request: flows, architectures, ERDs and anything visual go on the canvas; specs, notes, explanations and plans go in the doc. Use both when the request needs both (e.g. "design the schema and document it"), keeping them consistent.
- To turn one surface into the other ("write up this diagram as a spec", "draw what the doc describes"), read its current state below.
- If a surface you need is marked as not open, tell the user to switch to the Both view instead of calling its tools.
- Check tool results before claiming a change. If an edit fails, correct it or explain which edit failed.
- After making changes, reply with one short sentence on what you did.

Doc rules:
- Write content as Markdown in the doc tools: headings, lists, checklists, tables, code blocks, bold, links.
- Prefer targeted edits: insertDocContent to add, updateDocBlock to rewrite one block, deleteDocBlocks to remove. Use replaceDoc only for a full rewrite or when the doc is empty.
- Reference only block ids listed in the current doc state.

Canvas rules:
- One tool call per shape. Every new shape needs a unique caller-assigned "id" (e.g. "rect-1") so later calls in the same turn can reference it (e.g. an arrow's fromShapeId/toShapeId).
- Reference only shape ids listed in the current canvas state or created earlier in this turn. Never invent an id.

Canvas layout rules: diagrams must never look cluttered or have overlapping shapes. The canvas is infinite, so spread out as far as needed instead of packing shapes near (0,0).
- Size each box to its label (a short label like "Start" might be 140x80; a label needing 2-3 lines might be 260x140), and compute spacing from actual sizes.
- Vertical gap between stacked boxes: at least 100px of empty space (next y >= previous y + previous height + 100).
- Horizontal gap between side-by-side boxes (e.g. Yes/No branches): at least 120px of empty space (next x >= previous x + previous width + 120).
- Plan positions box by box, adding up real sizes as you go, before creating shapes.
- A title (createText) goes centered above the whole diagram, at least 100px above the topmost box.

`;

const NOT_OPEN = "(not open in this view, so its tools will fail)";

type ProviderName = "google" | "openrouter" | "groq";
const openrouter = createOpenAICompatible({
  name: "openrouter",
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  headers: { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", "X-Title": "Cocraft" },
});
const groq = createOpenAICompatible({
  name: "groq",
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

function configuredModels() {
  const selected = process.env.AI_PROVIDER?.toLowerCase();
  const preferred: ProviderName = selected === "google" || selected === "gemini"
    ? "google"
    : selected === "openrouter" ? "openrouter" : "groq";
  const order: ProviderName[] = [preferred, ...(["google", "openrouter", "groq"] as const).filter((name) => name !== preferred)];
  const models: { provider: ProviderName; model: LanguageModel }[] = [];
  for (const provider of order) {
    if (provider === "google") {
      const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (key) models.push({ provider, model: google(process.env.GEMINI_MODEL || "gemini-2.5-flash") });
      continue;
    }
    const key = provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY;
    const model = provider === "groq" ? process.env.GROQ_MODEL : process.env.OPENROUTER_MODEL;
    if (key && model) models.push({ provider, model: provider === "groq" ? groq.chatModel(model) : openrouter.chatModel(model) });
  }
  return models;
}

type AgentStreamArgs = Omit<Parameters<typeof streamText>[0], "model" | "messages" | "prompt"> & { messages: NonNullable<Parameters<typeof streamText>[0]["messages"]> };

async function streamWithFallback(args: AgentStreamArgs) {
  for (const { provider, model } of configuredModels()) {
    if (args.abortSignal?.aborted) throw args.abortSignal.reason;
    const result = streamText({ ...args, model, maxRetries: 0 });
    const reader = result.fullStream.getReader();
    const pending: (typeof result.fullStream extends ReadableStream<infer Part> ? Part : never)[] = [];
    try {
      // Buffer protocol setup so a failed provider never reaches the browser.
      while (true) {
        const { done, value } = await reader.read();
        if (done || value.type === "error" || value.type === "abort") break;
        pending.push(value);
        if (value.type !== "text-delta" && value.type !== "tool-call") continue;

        return new ReadableStream<(typeof pending)[number]>({
          start(controller) {
            for (const part of pending) controller.enqueue(part);
          },
          async pull(controller) {
            const next = await reader.read();
            if (next.done) controller.close();
            else controller.enqueue(next.value);
          },
          cancel(reason) {
            return reader.cancel(reason);
          },
        });
      }
    } catch {
      // A transport error before output is safe to retry with another model.
    }

    void reader.cancel().catch(() => {});
    if (!args.abortSignal?.aborted) console.warn(`Agent provider ${provider} failed before sending output`);
  }
  throw new Error("All configured AI providers failed.");
}

export async function POST(req: Request) {
  const user = await checkUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const {
    messages,
    workspaceId,
    canvasContext,
    docContext,
  }: {
    messages: UIMessage[];
    workspaceId: string;
    canvasContext: string | null;
    docContext: string | null;
  } = await req.json();

  if (!(await canAccessWorkspace(workspaceId))) return new Response("Workspace not found", { status: 404 });

  // Only a message the user typed counts as a prompt; the automatic follow-ups after tool calls
  // end with the agent's own message, so a prompt that draws 20 shapes still counts once.
  let ownerId: string | null = null;
  if (messages.at(-1)?.role === "user") {
    ownerId = await getWorkspaceOwnerId(workspaceId);
    const { used, limit } = await getPromptUsage(ownerId);
    // Checked before calling Gemini, so an exhausted plan costs nothing.
    if (used >= limit) return Response.json({ error: PROMPT_LIMIT_ERROR, used, limit }, { status: 402 });
  }

  let stream;
  try {
    stream = await streamWithFallback({
      system: `${SYSTEM_PROMPT}\n\nCurrent canvas state:\n${canvasContext ?? NOT_OPEN}\n\nCurrent doc state:\n${docContext ?? NOT_OPEN}`,
      // No `execute` on any tool: they run in the browser against the live canvas and doc editors
      // (see hooks/use-workspace-agent-chat.ts), since that's where the real state lives.
      tools: agentToolDefs,
      messages: await convertToModelMessages(messages),
      abortSignal: req.signal,
      onFinish: async ({ finishReason }) => {
        if (ownerId && finishReason !== "error") await recordPrompt(ownerId, user.id, workspaceId);
      },
    });
  } catch (error) {
    console.error("All configured agent providers failed", error);
    return Response.json({ error: "All configured AI providers are unavailable. Check your model settings and try again." }, { status: 503 });
  }

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream, tools: agentToolDefs, sendReasoning: true }) });
}
