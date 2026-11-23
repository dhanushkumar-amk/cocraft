"use client";

import { Cloud, Database, Mail, Globe, Server, ShieldCheck, HardDrive, Layers, Bell, Workflow, Cpu, Monitor } from "lucide-react";
import type { CanvasController } from "@/lib/canvas";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

const services = [
  { name: "Web client", Icon: Globe }, { name: "Email", Icon: Mail },
  { name: "Cloud service", Icon: Cloud }, { name: "Database", Icon: Database },
  { name: "Cache", Icon: Layers }, { name: "File storage", Icon: HardDrive },
  { name: "Authentication", Icon: ShieldCheck }, { name: "Message queue", Icon: Workflow },
  { name: "Notifications", Icon: Bell }, { name: "API server", Icon: Server },
  { name: "Compute", Icon: Cpu }, { name: "Application", Icon: Monitor },
];
export function ServiceIconPicker({ controller }: { controller: CanvasController }) {
  return <details className="relative rounded border border-white/15 bg-neutral-900 text-white">
    <summary className="cursor-pointer px-3 py-2 text-xs">Service icons</summary>
    <div className="absolute right-0 top-10 z-40 grid w-64 grid-cols-3 gap-1 rounded-lg border border-white/15 bg-neutral-900 p-2 shadow-xl">
      {services.map(({ name, Icon }) => <button key={name} title={name} className="flex flex-col items-center gap-1 rounded p-2 text-xs hover:bg-white/10" onClick={(event) => {
        const svg = event.currentTarget.querySelector("svg");
        if (!svg) return;
        const id = crypto.randomUUID();
        const dataURL = "data:image/svg+xml;base64," + btoa(new XMLSerializer().serializeToString(svg));
        controller.api.addFiles([{ id, dataURL, mimeType: "image/svg+xml", created: Date.now() } as BinaryFileData]);
        const selected = controller.getSelectedShapes().find((shape) => shape.type !== "text");
        const state = controller.api.getAppState();
        controller.append([{ type: "image", fileId: id as BinaryFileData["id"], x: selected ? selected.x + 8 : -state.scrollX + 150, y: selected ? selected.y - 32 : -state.scrollY + 150, width: 28, height: 28 }]);
      }}><Icon size={24} color="#a5b4fc" />{name}</button>)}
    </div>
  </details>;
}
