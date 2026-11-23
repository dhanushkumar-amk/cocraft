"use client";

import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { loadCanvasSnapshot } from "@/lib/canvas";
import { canvasThemes } from "@/lib/canvas-theme";
import { ServiceGeoShapeUtil } from "@/components/ServiceIcons";
import { EntityTableShapeUtil } from "@/components/EntityTable/EntityTableShapeUtil";

const shapeUtils = [EntityTableShapeUtil, ServiceGeoShapeUtil];

// Read-only canvas from the last saved snapshot in Postgres — used by the public shared link,
// so it never joins the live sync room.
export function CanvasViewer({ snapshot }: { snapshot: unknown }) {
  const handleMount = (editor: Editor) => {
    loadCanvasSnapshot(editor, snapshot);
    editor.updateInstanceState({ isReadonly: true });
    editor.zoomToFit();
  };

  // isolate keeps tldraw's high z-index layers inside the canvas (see CanvasEditor).
  return (
    <div className="workspace-canvas isolate h-full">
      <Tldraw
        themes={canvasThemes}
        shapeUtils={shapeUtils}
        onMount={handleMount}
        colorScheme="dark"
        licenseKey={process.env.NEXT_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
}
