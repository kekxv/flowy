export const PRESETS = {
  ocean: "#2563eb",
  violet: "#7c3aed",
  emerald: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
};

export type ThemeName = keyof typeof PRESETS;

export function applyTheme(color: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
  const value = color.replace("#", "");
  const rgb = [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ].join(", ");
  const root = document.documentElement;
  root.style.setProperty("--primary", color);
  root.style.setProperty("--primary-rgb", rgb);
  root.style.setProperty("--primary-hover", `color-mix(in srgb, ${color} 86%, black)`);
  root.style.setProperty("--primary-light", `color-mix(in srgb, ${color} 15%, white)`);
  root.style.setProperty("--primary-subtle", `color-mix(in srgb, ${color} 7%, white)`);
}
