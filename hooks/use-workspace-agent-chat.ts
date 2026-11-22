"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Box, type Editor, type TLShapeId } from "tldraw";
import type { BlockNoteEditor } from "@blocknote/core";
import { agentToolDefs, docToolDefs, fail, type ToolResult } from "@/lib/agent-tools";
import { PROMPT_LIMIT_ERROR, UPGRADE_REASONS } from "@/lib/plan-limits";
import { executeCanvasTool, summarizeCanvas, type ShapeIdMap } from "@/lib/agent-canvas";
import { executeDocTool, summarizeDoc } from "@/lib/agent-doc";
import { refreshPromptUsage } from "@/components/PlanButton";
import { useUpgradeDialog } from "@/components/UpgradeDialog";

type Editors = { canvasEditor: Editor | null; docEditor: BlockNoteEditor | null };

// Every call must produce an output (even a failure), or the chat waits on it forever.
function runTool({ canvasEditor, docEditor }: Editors, idMap: ShapeIdMap, toolName: string, input: unknown): ToolResult {
  try {
    if (toolName in docToolDefs) {
      return docEditor
        ? executeDocTool(docEditor, toolName, input)
        : fail("The doc isn't open in this view. Tell the user to switch to the Both or Document view.");
    }
    return canvasEditor
      ? executeCanvasTool(canvasEditor, idMap, toolName, input)
      : fail("The canvas isn't open in this view. Tell the user to switch to the Both or Canvas view.");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Tool failed");
  }
}

export function useWorkspaceAgentChat(workspaceId: string, editors: Editors) {
  const idMap = useRef<ShapeIdMap>(new Map());
  const editedShapes = useRef(new Set<TLShapeId>());
  const openUpgrade = useUpgradeDialog();
  const editorsRef = useRef(editors);
  useEffect(() => {
    editorsRef.current = editors;
  });

  // Built once, so it reads the latest editors on each request: every request (including the
  // automatic follow-ups after tool calls) carries the current state of both surfaces.
  const [transport] = useState(
    // The ref is only read when a request is sent, never during render.
    // eslint-disable-next-line react-hooks/refs
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        body: () => {
          const { canvasEditor, docEditor } = editorsRef.current;
          return {
            workspaceId,
            canvasContext: canvasEditor ? summarizeCanvas(canvasEditor) : null,
            docContext: docEditor ? summarizeDoc(docEditor) : null,
          };
        },
      })
  );

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: () => {
      const editor = editorsRef.current.canvasEditor;
      if (editor && editedShapes.current.size) {
        const bounds = [...editedShapes.current].flatMap((id) => editor.getShapePageBounds(id) ?? []);
        if (bounds.length) editor.zoomToBounds(Box.Common(bounds), { inset: 64, targetZoom: 1, animation: { duration: 200 } });
      }
      editedShapes.current.clear();
      refreshPromptUsage();
    },
    onError: (error) => {
      if (!error.message.includes(PROMPT_LIMIT_ERROR)) return;
      refreshPromptUsage();
      openUpgrade(UPGRADE_REASONS.prompts);
    },
    onToolCall: ({ toolCall }) => {
      const output = runTool(editorsRef.current, idMap.current, toolCall.toolName, toolCall.input);
      if (output.success && !(toolCall.toolName in docToolDefs) && toolCall.toolName !== "deleteShape") {
        const input = toolCall.input as { id?: string; tableId?: string };
        const key = input.id ?? input.tableId;
        if (key) editedShapes.current.add(idMap.current.get(key) ?? key as TLShapeId);
      }
      // Not awaited: the SDK checks for the automatic resubmit right after this callback returns.
      chat.addToolOutput({
        tool: toolCall.toolName as keyof typeof agentToolDefs,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });

  return chat;
}

export type WorkspaceAgentChat = ReturnType<typeof useWorkspaceAgentChat>;
