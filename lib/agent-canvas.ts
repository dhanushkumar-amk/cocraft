import type { CanvasController, CanvasShape } from "@/lib/canvas";
import { canvasToolDefs, fail, normalizeModelText, ok, type ToolResult } from "@/lib/agent-tools";

export type ShapeIdMap = Map<string, string>;
export function summarizeShape(shape: CanvasShape) {
  return `- id: ${shape.id}, type: ${shape.type}${shape.type === "text" && shape.containerId ? `, labelOf: ${shape.containerId}` : ""}, position: (${Math.round(shape.x)}, ${Math.round(shape.y)})${shape.type === "text" ? `, label: "${shape.text}"` : ""}`;
}
export function summarizeCanvas(editor: CanvasController) {
  const shapes = editor.getCurrentPageShapes();
  return "Selected component ids: " + editor.getSelectedShapeIds().join(", ") + "\n" + (shapes.length ? shapes.map(summarizeShape).join("\n") : "(empty canvas)");
}
export function executeCanvasTool(editor: CanvasController, ids: ShapeIdMap, name: string, raw: unknown): ToolResult {
  const resolve = (id: string) => ids.get(id) ?? id;
  const newId = (id: string) => {
    const result = ids.get(id) ?? crypto.randomUUID();
    ids.set(id, result);
    return result;
  };
  switch (name) {
    case "createRectangle":
    case "createEllipse": {
      const input = canvasToolDefs[name].inputSchema.parse(raw);
      const id = newId(input.id);
      if (editor.getShape(id)) return ok();
      editor.append([{ id, type: name === "createEllipse" ? "ellipse" : "rectangle", x: input.position.x, y: input.position.y, width: input.width, height: input.height, strokeColor: input.color ?? "#e5e7eb", ...(input.backgroundColor && { backgroundColor: input.backgroundColor, fillStyle: "solid" as const }), ...(input.label && { label: { text: normalizeModelText(input.label), fontSize: 20 } }) }]);
      return ok();
    }
    case "createText": {
      const input = canvasToolDefs.createText.inputSchema.parse(raw);
      const id = newId(input.id);
      if (!editor.getShape(id)) editor.append([{ id, type: "text", x: input.position.x, y: input.position.y, text: normalizeModelText(input.text), fontSize: input.fontSize ?? 24, strokeColor: "#e5e7eb" }]);
      return ok();
    }
    case "createArrow": {
      const input = canvasToolDefs.createArrow.inputSchema.parse(raw);
      const from = editor.getShape(resolve(input.fromShapeId));
      const to = editor.getShape(resolve(input.toShapeId));
      if (!from || !to) return fail("Arrow endpoints must refer to existing components.");
      const id = newId(input.id);
      if (!editor.getShape(id)) editor.append([{ id, type: "arrow", x: from.x + from.width / 2, y: from.y + from.height / 2, points: [[0, 0], [to.x + to.width / 2 - from.x - from.width / 2, to.y + to.height / 2 - from.y - from.height / 2]], strokeColor: input.color ?? "#e5e7eb", strokeStyle: input.dashed ? "dashed" : "solid", startBinding: { elementId: from.id, focus: 0, gap: 8 }, endBinding: { elementId: to.id, focus: 0, gap: 8 }, ...(input.label && { label: { text: input.label } }) }]);
      return ok();
    }
    case "updateShape": {
      const input = canvasToolDefs.updateShape.inputSchema.parse(raw);
      editor.update(resolve(input.id), { x: input.position?.x, y: input.position?.y, width: input.width, height: input.height, label: input.label });
      return ok();
    }
    case "deleteShape": {
      const input = canvasToolDefs.deleteShape.inputSchema.parse(raw);
      editor.deleteShape(resolve(input.id));
      return ok();
    }
    default: return fail("Unknown canvas tool: " + name);
  }
}
