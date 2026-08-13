import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemePanel() {
  const { color, setColor, preset, setPreset, presets } = useTheme();
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  return <div ref={ref} className="relative"><button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><Palette size={16}/><span className="hidden xl:inline">主题</span></button>
    {open && <div className="absolute bottom-0 left-full z-50 ml-2 w-56 rounded-xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-lg)]">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Color theme</p>
      <div className="flex gap-2">{Object.entries(presets).map(([name, value]) => <button key={name} aria-label={name} onClick={() => setPreset(name as keyof typeof presets)} className={`h-7 w-7 rounded-full ring-offset-2 ${preset === name ? "ring-2 ring-[var(--text)]" : ""}`} style={{ backgroundColor: value }} />)}</div>
      <label className="mt-3 flex items-center justify-between text-[12px] text-[var(--text-secondary)]">Custom color <input aria-label="Custom theme color" type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
    </div>}
  </div>;
}
