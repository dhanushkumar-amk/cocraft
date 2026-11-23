import "@/lib/excalidraw-assets";
import {
  convertToExcalidrawElements, exportToCanvas, newElementWith, CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type CanvasSnapshot = { engine: "excalidraw"; elements: readonly ExcalidrawElement[]; files: BinaryFiles };
export type CanvasShape = ExcalidrawElement;
type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];

export class CanvasController {
  private disposed = false;
  get isDisposed() { return this.disposed; }
  activate() { this.disposed = false; }
  dispose() { this.disposed = true; }
  constructor(readonly api: ExcalidrawImperativeAPI) {}
  getCurrentPageShapes() { return this.api.getSceneElements().filter((element) => !element.isDeleted); }
  getCurrentPageShapeIds() { return new Set(this.getCurrentPageShapes().map((element) => element.id)); }
  getSelectedShapes() {
    const selected = this.api.getAppState().selectedElementIds;
    return this.getCurrentPageShapes().filter((element) => selected[element.id] || (element.type === "text" && element.containerId && selected[element.containerId]));
  }
  getSelectedShapeIds() { return this.getSelectedShapes().map((element) => element.id); }
  getShape(id: string) { return this.getCurrentPageShapes().find((element) => element.id === id); }
  append(skeleton: Skeleton[]) {
    const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
    const existing = this.api.getSceneElements().map((element) => {
      const arrows = elements.filter((item) => item.type === "arrow" && (item.startBinding?.elementId === element.id || item.endBinding?.elementId === element.id));
      if (!arrows.length) return element;
      return newElementWith(element, { boundElements: [...(element.boundElements ?? []), ...arrows.map((arrow) => ({ id: arrow.id, type: "arrow" as const }))] });
    });
    this.api.updateScene({ elements: [...existing, ...elements], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    return elements;
  }
  update(id: string, patch: { x?: number; y?: number; width?: number; height?: number; label?: string; strokeColor?: string }) {
    const scene = this.api.getSceneElements();
    const shape = this.getShape(id);
    if (!shape) throw new Error("Unknown component");
    const { label, ...values } = patch;
    const geometry = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
    const labels = new Set(shape.boundElements?.filter((item) => item.type === "text").map((item) => item.id));
    this.api.updateScene({
      elements: scene.map((element) => {
        if (element.id === id) {
          if (element.type === "text" && label !== undefined) {
            return newElementWith(element, { ...geometry, text: label, originalText: label });
          }
          return newElementWith(element, geometry);
        }
        if (labels.has(element.id) && element.type === "text") {
          return newElementWith(element, {
            x: element.x + ((patch.x ?? shape.x) - shape.x),
            y: element.y + ((patch.y ?? shape.y) - shape.y),
            ...(label !== undefined && { text: label, originalText: label }),
          });
        }
        return element;
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }
  deleteShape(id: string) {
    const shape = this.getShape(id);
    const removed = new Set([id, ...(shape?.boundElements?.filter((item) => item.type === "text").map((item) => item.id) ?? [])]);
    this.api.updateScene({ elements: this.api.getSceneElements().map((element) => removed.has(element.id) ? newElementWith(element, { isDeleted: true }) : element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }
  zoomToFit(_options?: unknown) {
    void _options;
    if (this.getCurrentPageShapes().length) this.api.scrollToContent(undefined, { fitToContent: true, animate: true });
  }
  snapshot(): CanvasSnapshot {
    return { engine: "excalidraw", elements: this.api.getSceneElements(), files: this.api.getFiles() };
  }
  async toImageDataUrl(_ids: string[], _options?: unknown) {
    void _ids; void _options;
    const canvas = await exportToCanvas({ elements: this.api.getSceneElements(), files: this.api.getFiles(), appState: { ...this.api.getAppState(), exportBackground: true, exportWithDarkMode: true }, exportPadding: 32 });
    return { url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  }
}

// Legacy snapshots remain untouched in the database until the converted scene is edited.
export function restoreCanvas(snapshot: unknown): { elements: readonly ExcalidrawElement[]; files: BinaryFiles } {
  if (!snapshot || typeof snapshot !== "object") return { elements: [], files: {} };
  const saved = snapshot as Partial<CanvasSnapshot> & { document?: { store?: Record<string, LegacyRecord> } };
  if (saved.engine === "excalidraw" && Array.isArray(saved.elements)) return { elements: saved.elements, files: saved.files ?? {} };
  const records = Object.values(saved.document?.store ?? {});
  const shapes = records.filter((record) => record.typeName === "shape");
  const skeletons: Skeleton[] = [];
  const files: BinaryFiles = {};
  const colors: Record<string, string> = { black: "#e5e7eb", blue: "#74c0fc", green: "#8ce99a", red: "#ffa8a8", orange: "#ffc078", violet: "#b197fc", yellow: "#ffe066" };
  for (const shape of shapes) {
    const props = shape.props ?? {};
    const base = { id: shape.id, x: shape.x ?? 0, y: shape.y ?? 0, width: Number(props.w ?? 220), height: Number(props.h ?? 100), angle: shape.rotation ?? 0, strokeColor: colors[String(props.color)] ?? "#e5e7eb" };
    const tableRows = Array.isArray(props.rows) ? props.rows.map((row: { name?: string; dataType?: string }) => `${row.name ?? ""}: ${row.dataType ?? ""}`).join("\n") : "";
    const text = legacyText(props.richText) || [props.tableName ?? props.text ?? "", tableRows].filter(Boolean).join("\n");
    if (shape.type === "arrow") {
      const start = props.start as { x: number; y: number } | undefined;
      const end = props.end as { x: number; y: number } | undefined;
      if (start && end) skeletons.push({ ...base, type: "arrow", x: base.x + start.x, y: base.y + start.y, points: [[0, 0], [end.x - start.x, end.y - start.y]], ...(text && { label: { text } }) });
    } else if (shape.type === "text") {
      skeletons.push({ ...base, type: "text", text: text || " ", fontSize: 24 });
    } else if (shape.type === "image") {
      const asset = saved.document?.store?.[String(props.assetId)];
      const src = asset?.props?.src;
      if (typeof src === "string" && /^(data:|https?:)/.test(src)) {
        const id = shape.id;
        files[id] = { id, dataURL: src, mimeType: String(asset?.props?.mimeType ?? "image/png"), created: Date.now(), lastRetrieved: Date.now() } as BinaryFiles[string];
        skeletons.push({ ...base, type: "image", fileId: id as BinaryFiles[string]["id"] });
      }
    } else {
      skeletons.push({ ...base, type: props.geo === "ellipse" ? "ellipse" : "rectangle", ...(text && { label: { text, fontSize: 20 } }), ...(shape.type === "note" && { backgroundColor: "#ffec99", strokeColor: "#1e293b", fillStyle: "solid" }) });
    }
  }
  const connected = skeletons.map((skeleton): Skeleton => {
    if (skeleton.type === "arrow") {
      const bindings = records.filter((record) => record.typeName === "binding" && record.fromId === skeleton.id && record.toId);
      const start = bindings.find((record) => record.props?.terminal === "start");
      const end = bindings.find((record) => record.props?.terminal === "end");
      return {
        ...skeleton,
        ...(start?.toId && { startBinding: { elementId: start.toId, focus: 0, gap: 8 } }),
        ...(end?.toId && { endBinding: { elementId: end.toId, focus: 0, gap: 8 } }),
      };
    }
    if (skeleton.type === "rectangle" || skeleton.type === "ellipse") {
      const attached = records.filter((record) => record.typeName === "binding" && record.toId === skeleton.id && record.fromId);
      return { ...skeleton, boundElements: attached.map((record) => ({ id: record.fromId!, type: "arrow" as const })) };
    }
    return skeleton;
  });
  return { elements: convertToExcalidrawElements(connected, { regenerateIds: false }), files };
}
type LegacyRecord = { id: string; typeName: string; fromId?: string; toId?: string; type?: string; x?: number; y?: number; rotation?: number; props?: Record<string, unknown> };
function legacyText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: string; content?: unknown[] };
  return [node.text ?? "", ...(node.content ?? []).map(legacyText)].filter(Boolean).join(" ");
}
