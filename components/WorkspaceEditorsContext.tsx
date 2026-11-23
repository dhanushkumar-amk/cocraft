"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { Editor } from "tldraw";
import type { BlockNoteEditor } from "@blocknote/core";

type Editors = { canvasEditor: Editor | null; docEditor: BlockNoteEditor | null };
const WorkspaceEditorsContext = createContext<(Editors & {
  registerCanvasEditor: (editor: Editor) => () => void;
  registerDocEditor: (editor: BlockNoteEditor) => () => void;
  getEditors: () => Editors;
}) | null>(null);

export function WorkspaceEditorsProvider({ children }: { children: ReactNode }) {
  const registry = useRef<Editors>({ canvasEditor: null, docEditor: null });
  const [editors, setEditors] = useState<Editors>({ canvasEditor: null, docEditor: null });
  const getEditors = useCallback(() => registry.current, []);
  const registerCanvasEditor = useCallback((editor: Editor) => {
    registry.current = { ...registry.current, canvasEditor: editor };
    setEditors(registry.current);
    return () => {
      // An older mount's cleanup must not clear a newer editor.
      if (registry.current.canvasEditor !== editor) return;
      registry.current = { ...registry.current, canvasEditor: null };
      setEditors(registry.current);
    };
  }, []);
  const registerDocEditor = useCallback((editor: BlockNoteEditor) => {
    registry.current = { ...registry.current, docEditor: editor };
    setEditors(registry.current);
    return () => {
      if (registry.current.docEditor !== editor) return;
      registry.current = { ...registry.current, docEditor: null };
      setEditors(registry.current);
    };
  }, []);
  return (
    <WorkspaceEditorsContext.Provider value={{ ...editors, getEditors, registerCanvasEditor, registerDocEditor }}>
      {children}
    </WorkspaceEditorsContext.Provider>
  );
}

export function useWorkspaceEditors() {
  const context = useContext(WorkspaceEditorsContext);
  if (!context) throw new Error("useWorkspaceEditors must be used within a WorkspaceEditorsProvider");
  return context;
}
