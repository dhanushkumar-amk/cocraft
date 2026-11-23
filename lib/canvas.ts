import {
  AssetRecordType, b64Vecs, createShapeId, toRichText,
  type Editor, type TLDefaultColorStyle, type TLShapePartial, type TLShape, type TLEditorSnapshot,
} from "tldraw";

type Element = {
  id: string; type: string; x: number; y: number; width: number; height: number;
  angle?: number; isDeleted?: boolean; text?: string; fontSize?: number;
  strokeColor?: string; backgroundColor?: string; strokeStyle?: string; opacity?: number;
  containerId?: string | null; fileId?: string | null;
  points?: [number, number][];
  startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null;
  name?: string;
};
type ExcalidrawSnapshot = {
  engine: "excalidraw";
  elements: Element[];
  files?: Record<string, { dataURL: string; mimeType?: string }>;
};

const colors: Record<string, TLDefaultColorStyle> = {
  "#e5e7eb": "black", "#ffffff": "black", "#1e293b": "black", "#1e1e1e": "black",
  "#74c0fc": "light-blue", "#a5d8ff": "light-blue", "#228be6": "blue",
  "#8ce99a": "light-green", "#b2f2bb": "light-green", "#40c057": "green",
  "#ffa8a8": "light-red", "#fcc2d7": "light-red", "#fa5252": "red",
  "#ffc078": "orange", "#fd7e14": "orange", "#b197fc": "light-violet",
  "#d0bfff": "light-violet", "#7950f2": "violet", "#ffe066": "yellow", "#ffec99": "yellow",
};
export function canvasColor(value?: string): TLDefaultColorStyle {
  return colors[value?.toLowerCase() ?? ""] ?? "black";
}

// Conversion is client-side. Original database records are replaced only by a later save.
export function loadCanvasSnapshot(editor: Editor, snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (!("engine" in snapshot) || snapshot.engine !== "excalidraw") {
    editor.loadSnapshot(snapshot as TLEditorSnapshot);
    return;
  }
  const scene = snapshot as ExcalidrawSnapshot;
  const elements = scene.elements.filter((element) => !element.isDeleted);
  const ids = new Map(elements.map((element) => [element.id, createShapeId(element.id)]));
  const shapes: TLShapePartial<TLShape>[] = [];
  for (const element of elements) {
    // Bound text becomes the container's editable label.
    if (element.type === "text" && element.containerId && ids.has(element.containerId)) continue;
    const label = elements.find((item) => item.type === "text" && item.containerId === element.id)?.text ?? element.text ?? element.name ?? "";
    const width = Math.max(1, element.width);
    const height = Math.max(1, element.height);
    const base = {
      id: ids.get(element.id)!, x: element.x, y: element.y, rotation: element.angle ?? 0,
      opacity: (element.opacity ?? 100) / 100,
    };
    const color = canvasColor(element.strokeColor);
    if (element.type === "image" && element.fileId && scene.files?.[element.fileId]) {
      const file = scene.files[element.fileId];
      const assetId = AssetRecordType.createId(element.fileId);
      if (!editor.getAsset(assetId)) {
        editor.createAssets([{
          id: assetId, typeName: "asset", type: "image",
          props: { name: element.fileId, src: file.dataURL, w: width, h: height, mimeType: file.mimeType ?? "image/png", isAnimated: false },
          meta: {},
        }]);
      }
      shapes.push({ ...base, type: "image", props: { assetId, w: width, h: height } });
    } else if (element.type === "arrow" || element.type === "line") {
      const points = element.points ?? [[0, 0], [width, height]];
      const start = points[0];
      const end = points[points.length - 1];
      shapes.push({ ...base, type: "arrow", props: {
        start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] },
        arrowheadEnd: element.type === "line" ? "none" : "arrow",
        color, dash: element.strokeStyle === "dashed" ? "dashed" : "solid", richText: toRichText(label),
      } });
    } else if (element.type === "text") {
      const size = (element.fontSize ?? 24) <= 18 ? "s" : (element.fontSize ?? 24) <= 24 ? "m" : "l";
      shapes.push({ ...base, type: "text", props: { richText: toRichText(label), color, size, w: width, autoSize: false } });
    } else if (element.type === "freedraw" && element.points?.length) {
      shapes.push({ ...base, type: "draw", props: { color, segments: [{ type: "free", path: b64Vecs.encodePoints(element.points.map(([x, y]) => ({ x, y, z: 0.5 }))) }], isComplete: true } });
    } else {
      shapes.push({ ...base, type: "geo", props: {
        geo: element.type === "ellipse" ? "ellipse" : element.type === "diamond" ? "diamond" : "rectangle",
        w: width, h: height, richText: toRichText(label),
        color: element.backgroundColor && element.backgroundColor !== "transparent" ? canvasColor(element.backgroundColor) : color,
        fill: element.backgroundColor && element.backgroundColor !== "transparent" ? "semi" : "none",
        dash: element.strokeStyle === "dashed" ? "dashed" : "solid",
      } });
    }
  }
  editor.createShapes(shapes);
  for (const element of elements.filter((item) => item.type === "arrow")) {
    for (const [terminal, binding] of [["start", element.startBinding], ["end", element.endBinding]] as const) {
      if (!binding || !ids.has(binding.elementId)) continue;
      editor.createBinding({
        type: "arrow", fromId: ids.get(element.id)!, toId: ids.get(binding.elementId)!,
        props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
      });
    }
  }
}
