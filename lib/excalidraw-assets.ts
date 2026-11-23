declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string } }

// This module must evaluate before Excalidraw registers its font faces.
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/excalidraw/";
export {};
