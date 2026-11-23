"use client";

import { Cloud, Database, Mail, Globe, Server, ShieldCheck, HardDrive, Layers, Bell, Workflow, Cpu, Monitor, X } from "lucide-react";
import { GeoShapeUtil, HTMLContainer, createShapeId, toRichText, useEditor, useValue, type TLGeoShape, type SvgExportContext } from "tldraw";

export const serviceIcons = {
  web: { name: "Web / browser", Icon: Globe, match: /web|browser|client/i },
  email: { name: "Email", Icon: Mail, match: /mail|smtp/i },
  cloud: { name: "Cloud service", Icon: Cloud, match: /cloud|aws|azure|gcp/i },
  database: { name: "Database", Icon: Database, match: /database|postgres|mysql|\bdb\b|mongo/i },
  cache: { name: "Cache", Icon: Layers, match: /cache|redis|caching/i },
  storage: { name: "File storage", Icon: HardDrive, match: /storage|s3|bucket|file/i },
  security: { name: "Authentication", Icon: ShieldCheck, match: /auth|security|login/i },
  queue: { name: "Message queue", Icon: Workflow, match: /queue|kafka|rabbit/i },
  notification: { name: "Notifications", Icon: Bell, match: /notification|alert/i },
  api: { name: "API / server", Icon: Server, match: /api|gateway|server|balancer/i },
  compute: { name: "Compute", Icon: Cpu, match: /compute|worker|function/i },
  app: { name: "Application", Icon: Monitor, match: /app|service/i },
};
type ServiceIcon = keyof typeof serviceIcons;

function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as { text?: string; content?: unknown[] };
  return [value.text ?? "", ...(value.content ?? []).map(textOf)].join(" ");
}
function iconFor(shape: TLGeoShape) {
  const explicit = shape.meta.serviceIcon;
  if (explicit === "none") return;
  if (typeof explicit === "string" && explicit in serviceIcons) return serviceIcons[explicit as ServiceIcon];
  const text = textOf(shape.props.richText);
  return Object.values(serviceIcons).find((item) => item.match.test(text));
}
function Badge({ shape }: { shape: TLGeoShape }) {
  const service = iconFor(shape);
  if (!service) return null;
  const size = Math.min(34, shape.props.w * 0.22, shape.props.h * 0.5);
  return (
    <g transform={`translate(14, ${-size / 2})`}>
      <rect width={size} height={size} rx={9} fill="var(--tl-color-panel, #202020)" stroke="var(--tl-color-muted-1, #4b465d)" strokeWidth={1.2} />
      <service.Icon x={size * 0.2} y={size * 0.2} width={size * 0.6} height={size * 0.6} color="#a5b4fc" strokeWidth={1.8} />
    </g>
  );
}
export class ServiceGeoShapeUtil extends GeoShapeUtil {
  override component(shape: TLGeoShape) {
    return (
      <>
        {super.component(shape)}
        <HTMLContainer style={{ pointerEvents: "none", overflow: "visible" }}>
          <svg width={shape.props.w * shape.props.scale} height={shape.props.h * shape.props.scale} style={{ overflow: "visible", display: "block" }}>
            <g transform={`scale(${shape.props.scale})`}><Badge shape={shape} /></g>
          </svg>
        </HTMLContainer>
      </>
    );
  }
  override toSvg(shape: TLGeoShape, context: SvgExportContext) {
    return <g>{super.toSvg(shape, context)}<g transform={`scale(${shape.props.scale})`}><Badge shape={shape} /></g></g>;
  }
}

export function ServiceIconPicker() {
  const editor = useEditor();
  const selection = useValue("service selection", () => editor.getSelectedShapes().filter((s) => s.type === "geo"), [editor]);
  function apply(icon: string, name: string) {
    if (selection.length) {
      editor.updateShapes(selection.map((shape) => ({ id: shape.id, type: shape.type, meta: { ...shape.meta, serviceIcon: icon } })));
    } else if (icon !== "none") {
      const center = editor.getViewportPageBounds().center;
      const id = createShapeId();
      editor.createShape({ id, type: "geo", x: center.x - 110, y: center.y - 55, meta: { serviceIcon: icon }, props: { w: 220, h: 110, richText: toRichText(name) } });
      editor.select(id);
    }
  }
  return <details className="absolute bottom-20 left-16 z-10 max-h-[60%] overflow-auto rounded-xl border border-white/10 bg-card text-foreground shadow-lg">
    <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium">Service icons</summary>
    <p className="w-64 border-t border-white/10 px-3 pt-3 text-xs text-muted-foreground">{selection.length ? "Choose an icon for the selected component." : "Choose a service to add to the canvas."}</p>
    <div className="grid w-64 grid-cols-3 gap-1 p-2">
      {Object.entries(serviceIcons).map(([id, { name, Icon }]) => <button key={id} title={name} aria-label={name} onClick={() => apply(id, name)} className="flex flex-col items-center gap-1 rounded p-2 text-xs hover:bg-white/10"><Icon size={22} className="text-indigo-300" />{name}</button>)}
      <button onClick={() => apply("none", "")} className="flex flex-col items-center gap-1 rounded p-2 text-xs hover:bg-white/10"><X size={22} />No icon</button>
    </div>
  </details>;
}
