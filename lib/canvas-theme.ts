import { DEFAULT_THEME } from "tldraw";

// Bright paper colors for notes in both workspace modes.
const fills: Record<string, string> = {
  black: "#f1f5f9", grey: "#e2e8f0", white: "#ffffff",
  yellow: "#fde68a", orange: "#fed7aa",
  blue: "#bfdbfe", "light-blue": "#bae6fd",
  green: "#bbf7d0", "light-green": "#d9f99d",
  red: "#fecaca", "light-red": "#fbcfe8",
  violet: "#ddd6fe", "light-violet": "#e9d5ff",
};
function notePalette(palette: typeof DEFAULT_THEME.colors.dark) {
  return Object.fromEntries(Object.entries(palette).map(([key, value]) => [
    key,
    typeof value === "object" && key in fills
      ? { ...value, noteFill: fills[key], noteText: "#1e293b" }
      : value,
  ])) as typeof palette;
}
export const canvasThemes = {
  default: {
    ...DEFAULT_THEME,
    colors: {
      light: notePalette(DEFAULT_THEME.colors.light),
      dark: notePalette(DEFAULT_THEME.colors.dark),
    },
  },
};
