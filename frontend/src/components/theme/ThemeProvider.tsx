import { useEffect, useState } from "react";
import api from "../../api/client";
import { ThemeContext } from "./ThemeContext";
import { applyTheme, PRESETS, type ThemeName } from "./theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [color, setColorState] = useState(() => localStorage.getItem("flowy-theme-color") || PRESETS.ocean);
  const [preset, setPresetState] = useState<ThemeName>(() => (localStorage.getItem("flowy-theme-preset") as ThemeName) || "ocean");
  useEffect(() => { applyTheme(color); localStorage.setItem("flowy-theme-color", color); }, [color]);
  useEffect(() => { api.get("/system/settings").then(({ data }) => { if (data.theme_primary_color && !localStorage.getItem("flowy-theme-color")) setColorState(data.theme_primary_color); }).catch(() => {}); }, []);
  const setColor = (next: string) => { setColorState(next); if (!Object.values(PRESETS).includes(next)) setPresetState("ocean"); };
  const setPreset = (next: ThemeName) => { setPresetState(next); setColorState(PRESETS[next]); localStorage.setItem("flowy-theme-preset", next); };
  return <ThemeContext.Provider value={{ color, setColor, preset, setPreset, presets: PRESETS }}>{children}</ThemeContext.Provider>;
}
