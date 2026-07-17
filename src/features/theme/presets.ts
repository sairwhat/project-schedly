export type ThemePreset = {
  id: string;
  name: string;
  swatch: string;
  vars: Record<string, string>;
};

const h = (l: number, c: number, hue: number) => `oklch(${l} ${c} ${hue})`;

function derive(hue: number): ThemePreset["vars"] {
  return {
    "--primary": h(0.59, 0.22, hue),
    "--primary-foreground": h(0.99, 0, 0),
    "--secondary": h(0.95, 0.02, hue),
    "--secondary-foreground": h(0.40, 0.18, hue),
    "--accent": h(0.93, 0.03, hue),
    "--accent-foreground": h(0.35, 0.18, hue),
    "--ring": h(0.59, 0.22, hue),
    "--border": h(0.91, 0.02, hue),
    "--input": h(0.91, 0.02, hue),
    "--muted": h(0.96, 0.01, hue),
    "--muted-foreground": h(0.50, 0.02, hue),
    "--sidebar": h(0.965, 0.012, hue),
    "--sidebar-accent": h(0.93, 0.025, hue),
    "--sidebar-primary": h(0.59, 0.22, hue),
    "--sidebar-primary-foreground": h(0.99, 0, 0),
    "--sidebar-ring": h(0.59, 0.22, hue),
    "--chart-1": h(0.59, 0.22, hue),
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "rose",
    name: "Rose",
    swatch: h(0.59, 0.22, 355),
    vars: derive(355),
  },
  {
    id: "ocean",
    name: "Ocean",
    swatch: h(0.55, 0.20, 250),
    vars: derive(250),
  },
  {
    id: "emerald",
    name: "Emerald",
    swatch: h(0.55, 0.20, 160),
    vars: derive(160),
  },
  {
    id: "lavender",
    name: "Lavender",
    swatch: h(0.55, 0.20, 300),
    vars: derive(300),
  },
  {
    id: "amber",
    name: "Amber",
    swatch: h(0.60, 0.18, 80),
    vars: derive(80),
  },
  {
    id: "teal",
    name: "Teal",
    swatch: h(0.55, 0.18, 190),
    vars: derive(190),
  },
  {
    id: "coral",
    name: "Coral",
    swatch: h(0.60, 0.20, 25),
    vars: derive(25),
  },
  {
    id: "slate",
    name: "Slate",
    swatch: h(0.50, 0.05, 260),
    vars: derive(260),
  },
];

export const DEFAULT_THEME_ID = "rose";
