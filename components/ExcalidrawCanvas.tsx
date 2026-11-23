"use client";

import "@/lib/excalidraw-assets";
import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { toast } from "sonner";
import { CanvasController, restoreCanvas, type CanvasSnapshot } from "@/lib/canvas";
import { ServiceIconPicker } from "@/components/ServiceIcons";

export function ExcalidrawCanvas({ snapshot, onReady, onSave, readOnly = false }: {
  snapshot: unknown;
  onReady?: (controller: CanvasController) => () => void;
  onSave?: (snapshot: CanvasSnapshot) => Promise<void>;
  readOnly?: boolean;
}) {
  const [initial] = useState(() => restoreCanvas(snapshot));
  const [controller, setController] = useState<CanvasController | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<CanvasSnapshot | null>(null);
  const queue = useRef(Promise.resolve());
  const lastVersion = useRef("");
  const saveRef = useRef(onSave);
  useEffect(() => { saveRef.current = onSave; }, [onSave]);

  const flush = useCallback(() => {
    const scene = pending.current;
    if (!scene || !saveRef.current) return;
    pending.current = null;
    const save = saveRef.current;
    queue.current = queue.current.then(() => save(scene)).catch(() => {
      toast.error("Canvas changes could not be saved. Check your connection and edit again to retry.", { id: "canvas-save-error" });
      pending.current ??= scene;
    });
  }, []);

  useEffect(() => {
    if (!controller) return;
    controller.activate();
    const unregister = onReady?.(controller);
    const frame = requestAnimationFrame(() => controller.zoomToFit());
    return () => {
      cancelAnimationFrame(frame);
      if (timer.current) clearTimeout(timer.current);
      flush();
      controller.dispose();
      unregister?.();
    };
  }, [controller, onReady, flush]);

  const mount = useCallback((api: ExcalidrawImperativeAPI) => setController(new CanvasController(api)), []);
  function addNote() {
    if (!controller) return;
    const colors = ["#ffec99", "#a5d8ff", "#b2f2bb", "#fcc2d7", "#d0bfff"];
    const state = controller.api.getAppState();
    const x = -state.scrollX + 200 / state.zoom.value;
    const y = -state.scrollY + 200 / state.zoom.value;
    const elements = controller.append([{ id: crypto.randomUUID(), type: "rectangle", x, y, width: 220, height: 180, backgroundColor: colors[Math.floor(Math.random() * colors.length)], strokeColor: "#1e293b", fillStyle: "solid", roughness: 0, label: { text: "Note", fontSize: 22 } }]);
    controller.api.updateScene({ appState: { selectedElementIds: { [elements[0].id]: true } } });
  }
  return <div className="relative h-full min-h-0 w-full" onClick={() => setMenu(null)} onContextMenuCapture={(event) => {
    if (readOnly || !controller?.getSelectedShapes().length) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    setMenu({ x: Math.min(event.clientX - bounds.left, bounds.width - 190), y: Math.min(event.clientY - bounds.top, bounds.height - 60) });
  }}>
    <Excalidraw
      excalidrawAPI={mount}
      initialData={{ ...initial, appState: { theme: "dark", viewBackgroundColor: "#101014", exportWithDarkMode: true } }}
      theme="dark"
      viewModeEnabled={readOnly}
      onChange={(elements, _state, files) => {
        const version = String(getSceneVersion(elements)) + ":" + Object.keys(files).join(",");
        if (!lastVersion.current) { lastVersion.current = version; return; }
        if (version === lastVersion.current || readOnly) return;
        lastVersion.current = version;
        pending.current = { engine: "excalidraw", elements, files };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 700);
      }}
      UIOptions={{ canvasActions: { loadScene: !readOnly, saveToActiveFile: !readOnly, export: {}, toggleTheme: false } }}
      renderTopRightUI={() => !readOnly && controller ? <div className="flex gap-2">
        <button onClick={addNote} className="rounded border border-white/15 bg-neutral-900 px-3 py-2 text-xs text-white">Sticky note</button>
        <ServiceIconPicker controller={controller} />
      </div> : null}
    />
    {menu && <button className="absolute z-50 rounded-lg border border-white/15 bg-neutral-900 px-4 py-3 text-sm text-white shadow-xl" style={{ left: menu.x, top: menu.y }} onClick={() => window.dispatchEvent(new Event("cocraft:explain-selection"))}>Explain component</button>}
  </div>;
}
