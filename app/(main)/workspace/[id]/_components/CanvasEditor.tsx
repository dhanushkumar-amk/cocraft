"use client";

import { useCallback } from "react";
import { ExcalidrawCanvas } from "@/components/ExcalidrawCanvas";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { saveCanvasContent } from "@/actions/canvas";
import type { CanvasSnapshot } from "@/lib/canvas";
import type { Prisma } from "@/lib/generated/prisma/client";

export function CanvasEditor({ workspaceId, initialSnapshot }: { workspaceId: string; initialSnapshot: unknown }) {
  const { registerCanvasEditor } = useWorkspaceEditors();
  const save = useCallback(async (snapshot: CanvasSnapshot) => {
    await saveCanvasContent(workspaceId, JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue);
  }, [workspaceId]);
  return <ExcalidrawCanvas key={workspaceId} snapshot={initialSnapshot} onReady={registerCanvasEditor} onSave={save} />;
}
