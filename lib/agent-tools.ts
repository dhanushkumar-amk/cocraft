import { z } from "zod";

// Single source for every agent tool: the API route wraps these in the AI SDK's tool() (with no
// `execute`, so they run client-side), and the browser parses inputs with the same schemas.
// Canvas tools are fine-grained (one call per shape) and take a caller-assigned `id`, so the
// model can reference a shape it just created later in the same turn.

const point = z.object({ x: z.number(), y: z.number() });
const shapeId = (example: string) => z.string().describe(`Caller-assigned unique id, e.g. '${example}'`);
const boxShape = (example: string) =>
  z.object({ id: shapeId(example), position: point, width: z.number(), height: z.number(), label: z.string().optional() });

export const canvasToolDefs = {
  createRectangle: { description: "Create a rectangle on the canvas.", inputSchema: boxShape("rect-1") },
  createEllipse: { description: "Create an ellipse on the canvas.", inputSchema: boxShape("ellipse-1") },
  createText: {
    description: "Create a text label on the canvas.",
    inputSchema: z.object({ id: shapeId("text-1"), position: point, text: z.string(), fontSize: z.number().optional() }),
  },
  createArrow: {
    description: "Create an arrow connecting two existing shapes by their ids.",
    inputSchema: z.object({
      id: shapeId("arrow-1"),
      fromShapeId: z.string().describe("id of the shape this arrow starts at"),
      toShapeId: z.string().describe("id of the shape this arrow ends at"),
      label: z.string().optional(),
    }),
  },
  updateShape: {
    description: "Update an existing shape's position, size, or label.",
    inputSchema: z.object({
      id: z.string().describe("id of the shape to update"),
      position: point.optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      label: z.string().optional(),
    }),
  },
  deleteShape: {
    description: "Delete a shape from the canvas.",
    inputSchema: z.object({ id: z.string().describe("id of the shape to delete") }),
  },

};

const markdown = z.string().describe("Content as Markdown: headings, lists, checklists, tables, code, bold, links");

export const docToolDefs = {
  insertDocContent: {
    description: "Add content to the doc, at the end or after a given block.",
    inputSchema: z.object({
      markdown,
      afterBlockId: z.string().optional().describe("Insert after this block id; omit to append at the end"),
    }),
  },
  updateDocBlock: {
    description: "Rewrite one existing block of the doc (it may become several blocks).",
    inputSchema: z.object({ blockId: z.string(), markdown }),
  },
  deleteDocBlocks: {
    description: "Delete blocks from the doc.",
    inputSchema: z.object({ blockIds: z.array(z.string()).min(1) }),
  },
  replaceDoc: {
    description: "Replace the entire doc. Use only for a full rewrite or a brand-new doc.",
    inputSchema: z.object({ markdown }),
  },
};

export const agentToolDefs = { ...canvasToolDefs, ...docToolDefs };

export type ToolResult = { success: true } | { success: false; error: string };
export const ok = (): ToolResult => ({ success: true });
export const fail = (error: string): ToolResult => ({ success: false, error });

// Gemini sometimes escapes newlines as a literal "\n" inside tool arguments. Only unescape when
// the text has no real line breaks, so code that genuinely contains "\n" stays intact.
export function normalizeModelText(text: string) {
  return text.includes("\n") ? text : text.replace(/\\n/g, "\n");
}
