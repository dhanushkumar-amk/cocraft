"use client";

import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import {
  Tldraw,
  atom,
  computed,
  createTLCurrentUser,
  createTLStore,
  createUserId,
  getUserPreferences,
  UserRecordType,
  DefaultToolbar,
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  DefaultToolbarContent,
  DefaultMinimap,
  inlineBase64AssetStore,
  defaultShapeUtils,
  defaultBindingUtils,
  type Editor,
  type TLEditorSnapshot,
  type TLComponents,
} from "tldraw";
import { useSync, useSyncDemo } from "@tldraw/sync";
import "tldraw/tldraw.css";
import { canvasThemes } from "@/lib/canvas-theme";
import { saveCanvasContent } from "@/actions/canvas";
import type { Prisma } from "@/lib/generated/prisma/client";
import { EntityTableShapeUtil } from "@/components/EntityTable/EntityTableShapeUtil";
import { snapArrowBindingToRow } from "@/components/EntityTable/snapArrowToRow";
import { useWorkspaceEditors } from "@/components/WorkspaceEditorsContext";
import { ServiceGeoShapeUtil, ServiceIconPicker } from "@/components/ServiceIcons";
import { colorForUser } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 1000;
const STICKY_COLORS = ["yellow", "light-blue", "light-green", "light-red", "light-violet"] as const;

const shapeUtils = [EntityTableShapeUtil, ServiceGeoShapeUtil];

// Our own sync server (the tldraw-sync/ Cloudflare Worker). Without it, tldraw's public demo
// server is used: fine for trying things out, but rooms there are public and get wiped.
const SYNC_URL = process.env.NEXT_PUBLIC_TLDRAW_SYNC_URL;

// Unlike useSyncDemo, useSync doesn't add tldraw's built-in shapes itself. Built once here:
// a new array on every render would make useSync rebuild the store in a loop.
const syncShapeUtils = [...defaultShapeUtils.filter((util) => util.type !== "geo"), ...shapeUtils];
// Passing a schema bypasses useSyncDemo's unconditional addition of built-in utilities.
const syncSchema = createTLStore({
  shapeUtils: syncShapeUtils,
  bindingUtils: defaultBindingUtils,
}).schema;

type SyncOptions = { roomId: string; users?: Parameters<typeof useSyncDemo>[0]["users"] };

// Chosen once at load, so it's always the same hook. Images are stored inside the room.
const useCanvasSync = SYNC_URL
  ? ({ roomId, users }: SyncOptions) =>
      useSync({
        uri: `${SYNC_URL}/connect/${roomId}`,
        assets: inlineBase64AssetStore,
        shapeUtils: syncShapeUtils,
        bindingUtils: defaultBindingUtils,
        users,
      })
  : ({ roomId, users }: SyncOptions) => {
      // The demo hook forwards additional store options to useSync.
      // Embed images in the persisted canvas instead of uploading to its restricted host.
      const options = {
        roomId,
        schema: syncSchema,
        users,
        assets: inlineBase64AssetStore,
      };
      return useSyncDemo(options);
    };

// A cleaner, single-page canvas: no style panel, page menu or main menu, and a vertical toolbar
// on the left with our Add table button.
function CanvasContextMenu() {
  const editor = useEditor();
  const hasSelection = useValue("explain selection", () => editor.getSelectedShapeIds().length > 0, [editor]);
  return (
    <DefaultContextMenu>
      <TldrawUiMenuItem
        id="explain-component"
        label="Explain component"
        disabled={!hasSelection}
        onSelect={() => { window.dispatchEvent(new Event("cocraft:explain-selection")); }}
      />
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}

const components: TLComponents = {
  ContextMenu: CanvasContextMenu,
  InFrontOfTheCanvas: ServiceIconPicker,

  PageMenu: null,
  MainMenu: null,
  Minimap: DefaultMinimap,
  Toolbar: () => (
    <DefaultToolbar orientation="vertical">
      <DefaultToolbarContent />
    </DefaultToolbar>
  ),
};

export function CanvasEditor({
  workspaceId,
  initialSnapshot,
}: {
  workspaceId: string;
  initialSnapshot: TLEditorSnapshot | null;
}) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setCanvasEditor } = useWorkspaceEditors();
  const { user } = useUser();

  // Gives other collaborators this user's real name/avatar on their cursor instead of "New User".
  // Memoized on primitives because useSync reconnects whenever the users object changes.
  const userId = user?.id;
  const userName = user?.fullName ?? user?.username ?? "Anonymous";
  const userImageUrl = user?.imageUrl ?? "";
  const users = useMemo(() => {
    if (!userId) return undefined;
    return {
      currentUser: atom(
        "currentUser",
        UserRecordType.create({
          id: createUserId(userId),
          name: userName,
          color: colorForUser(userId),
          imageUrl: userImageUrl,
        })
      ),
    };
  }, [userId, userName, userImageUrl]);

  // The editor's own identity (people menu, your own cursor) is separate from what gets synced â€”
  // pin its name/color to Clerk too, keeping every other preference from tldraw's local storage.
  const currentUser = useMemo(() => {
    if (!userId) return undefined;
    return createTLCurrentUser({
      userPreferences: computed("clerkUserPreferences", () => ({
        ...getUserPreferences(),
        id: userId,
        name: userName,
        color: colorForUser(userId),
      })),
    });
  }, [userId, userName]);

  // The Postgres autosave below also re-seeds a room that starts empty.
  const store = useCanvasSync({ roomId: `outpost-${workspaceId}`, users });

  const handleMount = (editor: Editor) => {
    setCanvasEditor(editor);
    // Seed from Postgres only when the room is empty, so a joining user doesn't overwrite
    // what others have already drawn.
    if (initialSnapshot && editor.getCurrentPageShapeIds().size === 0) {
      editor.loadSnapshot(initialSnapshot);
    }

    const removeStickyColors = editor.sideEffects.registerBeforeCreateHandler("shape", (shape, source) => {
      if (source !== "user" || shape.type !== "note" || shape.meta.randomStickyColor) return shape;
      const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
      return {
        ...shape,
        meta: { ...shape.meta, randomStickyColor: true },
        props: { ...shape.props, color },
      };
    });

    const frame = requestAnimationFrame(() => {
      const shapes = editor.getCurrentPageShapeIds();
      const outside = editor.getNotVisibleShapes();
      if (shapes.size && [...shapes].every((id) => outside.has(id))) editor.zoomToFit();
    });

    editor.store.listen(
      () => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
          // getSnapshot() carries non-plain internals (schema is a class instance, not JSON) that
          // occasionally fail to cross the Server Action boundary as "opaque temporary reference"
          // errors â€” round-tripping through JSON strips those and leaves genuinely plain data.
          const plainSnapshot = JSON.parse(
            JSON.stringify(editor.getSnapshot())
          ) as Prisma.InputJsonValue;
          void saveCanvasContent(workspaceId, plainSnapshot).catch(() => {
            toast.error("Canvas could not be saved. Check your connection or reduce image sizes, then make an edit to retry.", {
              id: "canvas-save-error",
            });
          });
        }, SAVE_DEBOUNCE_MS);
      },
      { source: "user", scope: "document" }
    );

    // Arrows drawn onto an ERD table snap to the nearest row (see snapArrowToRow.ts).
    editor.store.listen(
      (entry) => {
        for (const record of Object.values(entry.changes.added)) {
          if (record.typeName === "binding" && record.type === "arrow") {
            snapArrowBindingToRow(editor, record);
          }
        }
      },
      { source: "user", scope: "all" }
    );

    // Clear it on unmount (e.g. switching to the Document view) so nothing keeps a disposed editor.
    return () => {
      removeStickyColors();
      cancelAnimationFrame(frame);
      setCanvasEditor(null);
    };
  };

  return (
    // isolate keeps tldraw's high z-index layers inside the canvas, so dialogs render above them.
    // The toolbar moves up into the space left by the hidden page menu (! beats tldraw.css).
    <div className="workspace-canvas isolate h-full [&_.tlui-main-toolbar--vertical]:top-4!">
      <Tldraw
        themes={canvasThemes}
        store={store}
        user={currentUser}
        onMount={handleMount}
        components={components}
        colorScheme="dark"
        shapeUtils={shapeUtils}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
    </div>
  );
}
