"use client";
import dynamic from "next/dynamic";
const Viewer = dynamic(() => import("@/components/ExcalidrawCanvas").then((module) => module.ExcalidrawCanvas), { ssr: false });
export function CanvasViewer({ snapshot }: { snapshot: unknown }) {
  return <Viewer snapshot={snapshot} readOnly />;
}
