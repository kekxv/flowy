import { createContext, useContext, useEffect, useState } from "react";
import api from "../../api/client";

const PRESETS = { ocean: "#2563eb", violet: "#7c3aed", emerald: "#059669", rose: "#e11d48", amber: "#d97706" };
type ThemeName = keyof typeof PRESETS;
type ThemeContextValue = { color: string; setColor: (color: string) => void; preset: ThemeName; setPreset: (preset: ThemeName) => void; presets: typeof PRESETS };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)].join(", ");
}

export function applyTheme(color: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
  const root = document.documentElement;
  const rgb = hexToRgb(color);
  root.style.setProperty("--primary", color);
  root.style.setProperty("--primary-rgb", rgb);
  root.style.setProperty("--primary-hover", `color-mix(in srgb, ${color} 86%, black)`);
  root.style.setProperty("--primary-light", `color-mix(in srgb, ${color} 15%, white)`);
  root.style.setProperty("--primary-subtle", `color-mix(in srgb, ${color} 7%, white)`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [color, setColorState] = useState(() => localStorage.getItem("flowy-theme-color") || PRESETS.ocean);
  const [preset, setPresetState] = useState<ThemeName>(() => (localStorage.getItem("flowy-theme-preset") as ThemeName) || "ocean");
  useEffect(() => { applyTheme(color); localStorage.setItem("flowy-theme-color", color); }, [color]);
  useEffect(() => { api.get("/system/settings").then(({ data }) => { if (data.theme_primary_color && !localStorage.getItem("flowy-theme-color")) setColorState(data.theme_primary_color); }).catch(() => {}); }, []);
  const setColor = (next: string) => { setColorState(next); if (!Object.values(PRESETS).includes(next)) setPresetState("ocean"); };
  const setPreset = (next: ThemeName) => { setPresetState(next); setColorState(PRESETS[next]); localStorage.setItem("flowy-theme-preset", next); };
  return <ThemeContext.Provider value={{ color, setColor, preset, setPreset, presets: PRESETS }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("ThemeProvider missing"); return value; }
