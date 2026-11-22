"use client";

import { Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { TLEditorSnapshot } from "tldraw";

const LoadedCanvas = dynamic(
  () => import("./CanvasEditor").then((module) => module.CanvasEditor),
  { ssr: false, loading: () => <div role="status" className="p-6 text-sm text-muted-foreground">Loading canvas?</div> },
);

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Canvas failed to initialize", error); }
  render() {
    if (this.state.failed) return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
        <p>The canvas could not load. Your saved diagram is available after reloading.</p>
        <button className="rounded-md border px-4 py-2" onClick={() => window.location.reload()}>Reload workspace</button>
      </div>
    );
    return this.props.children;
  }
}

export function CanvasEditor(props: { workspaceId: string; initialSnapshot: TLEditorSnapshot | null }) {
  return <CanvasBoundary key={props.workspaceId}><LoadedCanvas {...props} /></CanvasBoundary>;
}
