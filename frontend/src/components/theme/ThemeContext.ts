import { createContext, useContext } from "react";
import type { PRESETS, ThemeName } from "./theme";

export type ThemeContextValue = {
  color: string;
  setColor: (color: string) => void;
  preset: ThemeName;
  setPreset: (preset: ThemeName) => void;
  presets: typeof PRESETS;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider missing");
  return value;
}
