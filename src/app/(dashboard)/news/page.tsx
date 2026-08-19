"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MapPin,
  Newspaper,
  School,
  Building2,
  CloudSun,
  Globe,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  Navigation,
  Megaphone,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderAvatar } from "@/components/header-avatar";
import { NotificationBell } from "@/components/notification-bell";
import { AppNavPanel } from "@/components/app-nav-panel";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  phMapProvinces,
  phRegions,
  findProvinceByMapName,
  locationChoices,
  type Province,
} from "@/data/ph-locations";
import {
  getNews,
  type SuspensionInfo,
  type NewsCounts,
  type NewsArticle,
} from "./actions";
import { categoryOf, type NewsCategory } from "@/lib/news-categories";

const CATEGORIES: { key: NewsCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all", label: "All", icon: Globe },
  { key: "school", label: "School", icon: School },
  { key: "government", label: "Government", icon: Building2 },
  { key: "weather", label: "Weather", icon: CloudSun },
  { key: "news", label: "News", icon: Newspaper },
];

// Distinct fill colors by region so the map reads clearly (Shopee-style).
const REGION_COLORS: Record<string, string> = {
  "National Capital Region": "#fbbf24",
  "Ilocos Region": "#93c5fd",
  "Cagayan Valley": "#a5b4fc",
  "Central Luzon": "#6ee7b7",
  CALABARZON: "#fda4af",
  MIMAROPA: "#fdba74",
  "Bicol Region": "#f9a8d4",
  "Western Visayas": "#bef264",
  "Central Visayas": "#fcd34d",
  "Eastern Visayas": "#86efac",
  "Zamboanga Peninsula": "#c4b5fd",
  "Northern Mindanao": "#5eead4",
  "Davao Region": "#fca5a5",
  SOCCSKSARGEN: "#a7f3d0",
  Caraga: "#7dd3fc",
  Bangsamoro: "#d8b4fe",
  "Cordillera Administrative Region": "#bae6fd",
};
const DEFAULT_FILL = "#e2e8f0";

function timeAgo(pubDate: string): string {
  const t = Date.parse(pubDate);
  if (isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export default function NewsPage() {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const isAdmin = Boolean((authUser as Record<string, unknown> | null)?.isAdmin);

  // Step 1: location state (map + search)
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);

  // Selected place
  const [provinceName, setProvinceName] = useState<string | null>(null);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // Feed
  const [category, setCategory] = useState<NewsCategory>("all");
  const [allArticles, setAllArticles] = useState<NewsArticle[]>([]);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [counts, setCounts] = useState<NewsCounts | null>(null);
  const [suspension, setSuspension] = useState<SuspensionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedLocation, setLoadedLocation] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Map zoom (viewBox)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  // Multi-touch pinch: active pointers + the pinch baseline (distance and
  // midpoint when the second finger lands).
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Zoom toward a point on the map (cursor or pinch midpoint).
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      setZoom((prev) => {
        const next = Math.min(6, Math.max(1, prev * factor));
        if (next === prev) return prev;
        const w = 1000 / next;
        const h = 1300 / next;
        const worldX = px * 1000;
        const worldY = py * 1300;
        const x = Math.max(0, Math.min(1000 - w, worldX - px * w));
        const y = Math.max(0, Math.min(1300 - h, worldY - py * h));
        setPan({ x, y });
        return next;
      });
    },
    []
  );

  // Mouse-wheel zoom on the map itself. React attaches wheel listeners
  // passively, so preventDefault (stopping page scroll while zooming) needs
  // a native non-passive listener.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(
        e.deltaY < 0 ? 1.25 : 0.8,
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const clearPlace = useCallback(() => {
    setProvinceName(null);
    setRegionName(null);
    setCities([]);
    setSelectedCity(null);
    setAllArticles([]);
    setArticles([]);
    setCounts(null);
    setSuspension(null);
    setLoadedLocation(null);
    setMapOpen(true);
    setQuery("");
  }, []);

  const selectPlace = useCallback(
    (province: Province, regionName: string | null, city: string | null) => {
      setProvinceName(province.name);
      setRegionName(regionName);
      const choices = locationChoices(province);
      setCities(choices);
      setSelectedCity(city ?? choices[0] ?? province.name);
      setArticles([]);
      setLoadedLocation(null);
      setMapOpen(false);
      setQuery(province.name);
      if (city ?? choices[0]) setLoading(true);
    },
    []
  );

  // ---- location search suggestions over the bundled dataset ----
  // The dataset stores names like "Muntinlupa" / "VIGAN CITY", so queries with
  // a "City"/"Municipality" suffix ("Muntinlupa City") must match too.
  const normalizePlace = useCallback((s: string) => {
    return s
      .toLowerCase()
      .replace(/[ñÑ]/g, "n")
      .replace(/\b(?:city|municipality|mun\.?)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const suggestions = useMemo(() => {
    const qRaw = query.trim().toLowerCase();
    if (qRaw.length < 2) return [];
    const q = normalizePlace(qRaw);
    // "Cebu City" should select the city, "Cebu" the whole province.
    const preferCity = /\b(?:city|municipality|mun\.?)\b/.test(qRaw);
    const isMetroManila = q === "metro manila" || q === "ncr" || q === "manila metro";
    const out: { province: Province; regionName: string; city: string }[] = [];
    for (const region of phRegions) {
      for (const province of region.provinces) {
        let matchedCity = "";
        if (province.cities.length > 0) {
          const city = province.cities.find(
            (c) => normalizePlace(c).includes(q) && (preferCity || normalizePlace(c) === q)
          );
          if (city) matchedCity = city;
        }
        if (matchedCity) {
          out.push({ province, regionName: region.name, city: matchedCity });
          continue;
        }
        const provKey = normalizePlace(province.name);
        const isNcr = isMetroManila && provKey.includes("metropolitan");
        if (isNcr || provKey.includes(q)) {
          const entry = { province, regionName: region.name, city: "" };
          if (isNcr) out.unshift(entry);
          else out.push(entry);
        }
      }
      if (out.length >= 8) break;
    }
    return out.slice(0, 8);
  }, [query, normalizePlace]);

  // Nearby places: same-region provinces (or, inside Metro Manila, the other
  // NCR cities) so the user can hop between neighboring locations.
  const nearbyProvinces = useMemo(() => {
    if (!provinceName || !regionName) return [] as { name: string; cities: string[] }[];
    const region = phRegions.find((r) => r.name === regionName);
    if (!region) return [];
    return region.provinces.filter((p) => p.name !== provinceName);
  }, [provinceName, regionName]);

  const nearbyCities = useMemo(() => {
    if (!provinceName || !selectedCity) return [] as string[];
    const region = phRegions.find((r) => r.name === regionName);
    const province = region?.provinces.find((p) => p.name === provinceName);
    if (!province) return [];
    return province.cities.filter((c) => c !== selectedCity).slice(0, 12);
  }, [provinceName, selectedCity, regionName]);

  const selectProvinceByName = useCallback(
    (name: string) => {
      const region = phRegions.find((r) => r.name === regionName);
      const province = region?.provinces.find((p) => p.name === name);
      if (!province) return;
      setProvinceName(province.name);
      setCities(locationChoices(province));
      setSelectedCity(null);
    },
    [regionName]
  );

  useEffect(() => {
    if (!isAdmin || !provinceName || !selectedCity) return;
    let cancelled = false;
    getNews(provinceName, selectedCity, regionName ?? "", "all")
      .then(({ articles: full, location, counts: catCounts, suspension: susp }) => {
        if (cancelled) return;
        setAllArticles(full);
        setCounts(catCounts);
        setSuspension(susp);
        setArticles(full);
        setLoadedLocation(location);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load news. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, provinceName, selectedCity, regionName, refreshKey]);

  // Instant client-side chip switching — the full set is already cached.
  const switchCategory = useCallback(
    (key: NewsCategory) => {
      setCategory(key);
      setArticles(
        key === "all"
          ? allArticles
          : allArticles.filter((a) => categoryOf(a.title, a.excerpt, key))
      );
    },
    [allArticles]
  );

  // ---- map zoom helpers ----
  const viewBox = useMemo(() => {
    const w = 1000 / zoom;
    const h = 1300 / zoom;
    const x = Math.max(0, Math.min(1000 - w, (1000 - w) / 2 + pan.x));
    const y = Math.max(0, Math.min(1300 - h, (1300 - h) / 2 + pan.y));
    return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }, [zoom, pan]);

  if (authLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 pt-8 md:pt-0 md:space-y-8">
        <HeaderShell />
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <AppNavPanel />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-6xl pt-8 md:pt-0">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <AppNavPanel />
          <div className="min-w-0 flex-1">
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
                  <Newspaper className="h-6 w-6 text-rose-500" />
                </div>
                <h2 className="font-heading text-lg font-bold text-foreground">Access denied</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  You need admin privileges to view the News tab.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pt-8 md:pt-0 md:space-y-8">
      <HeaderShell />

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AppNavPanel />

        <div className="min-w-0 flex-1 space-y-4 md:space-y-8">
          {/* Search box (always visible) */}
          <Card className="border-border/50">
            <CardContent className="pt-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchFocused(true);
                  }}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="Search city, municipality, or province… (e.g. Muntinlupa, Quezon City, Cebu)"
                  className="w-full rounded-2xl border border-border/60 bg-background py-3 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setSearchFocused(true);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {searchFocused && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-border/60 bg-card p-1.5 shadow-xl">
                    {suggestions.map(({ province, regionName, city }, i) => (
                      <button
                        key={`${province.name}-${city}-${i}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectPlace(province, regionName, city)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {city || province.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {city ? `${province.name}, ` : ""}{regionName}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {mapOpen ? (
            /* ---------- STEP 1: MAP PICKER ---------- */
            <Card className="border-border/50 overflow-hidden">
              <CardContent className="pt-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-heading flex items-center gap-2 text-lg font-bold text-foreground">
                      <MapPin className="h-5 w-5 shrink-0 text-primary" />
                      Pick a place on the map
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Scroll to zoom · drag to move · tap a province to select.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-4 lg:flex-row">
                  {/* Clickable + zoomable + draggable map — like a normal 2D
                      map: wheel/pinch zoom, drag to pan in any direction. */}
                  <div className="relative lg:w-1/2">
                    <svg
                      ref={svgRef}
                      viewBox={viewBox}
                      className="mx-auto max-h-[440px] w-full touch-none select-none rounded-xl bg-blue-50/50 dark:bg-blue-950/20"
                      role="img"
                      aria-label="Map of Philippine provinces — scroll to zoom, drag to pan, tap to select"
                      onPointerDown={(e) => {
                        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                        if (pointersRef.current.size === 2) {
                          const pts = [...pointersRef.current.values()];
                          const a = pts[0];
                          const b = pts[1];
                          if (!a || !b) return;
                          pinchRef.current = {
                            dist: Math.hypot(a.x - b.x, a.y - b.y),
                            midX: (a.x + b.x) / 2,
                            midY: (a.y + b.y) / 2,
                            zoom,
                            panX: pan.x,
                            panY: pan.y,
                          };
                          dragRef.current = null;
                        } else if (pointersRef.current.size === 1) {
                          dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false };
                        }
                      }}
                      onPointerMove={(e) => {
                        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                        if (pinchRef.current && pointersRef.current.size >= 2) {
                          const other = [...pointersRef.current.entries()]
                            .find(([id]) => id !== e.pointerId)?.[1];
                          if (!other) return;
                          const cur = { x: e.clientX, y: e.clientY };
                          const dist = Math.hypot(cur.x - other.x, cur.y - other.y);
                          const midX = (cur.x + other.x) / 2;
                          const midY = (cur.y + other.y) / 2;
                          const base = pinchRef.current;
                          const next = Math.min(6, Math.max(1, base.zoom * (dist / Math.max(1, base.dist))));
                          const w = 1000 / next;
                          const h = 1300 / next;
                          const mid = { x: (midX - rect.left) / rect.width, y: (midY - rect.top) / rect.height };
                          const worldX = mid.x * 1000;
                          const worldY = mid.y * 1300;
                          const x = Math.max(0, Math.min(1000 - w, worldX - mid.x * w));
                          const y = Math.max(0, Math.min(1300 - h, worldY - mid.y * h));
                          setPan({ x, y });
                          if (next !== base.zoom) setZoom(next);
                          return;
                        }
                        const d = dragRef.current;
                        if (!d) return;
                        const dx = e.clientX - d.startX;
                        const dy = e.clientY - d.startY;
                        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
                        if (zoom > 1) {
                          const scale = rect.width / (1000 / zoom);
                          setPan({
                            x: Math.max(0, Math.min(1000 - 1000 / zoom, d.panX + dx / scale)),
                            y: Math.max(0, Math.min(1300 - 1300 / zoom, d.panY + dy / scale)),
                          });
                        }
                      }}
                      onPointerUp={(e) => {
                        pointersRef.current.delete(e.pointerId);
                        if (pointersRef.current.size < 2) pinchRef.current = null;
                        dragRef.current = null;
                      }}
                      onPointerCancel={(e) => {
                        pointersRef.current.delete(e.pointerId);
                        if (pointersRef.current.size < 2) pinchRef.current = null;
                        dragRef.current = null;
                      }}
                      onPointerLeave={(e) => {
                        pointersRef.current.delete(e.pointerId);
                        if (pointersRef.current.size < 2) pinchRef.current = null;
                        dragRef.current = null;
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                        zoomAt(1.6, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
                      }}
                    >
                      {phMapProvinces.map((p) => {
                        const info = findProvinceByMapName(p.name);
                        const region = info?.regionName ?? null;
                        const base = region ? REGION_COLORS[region] ?? DEFAULT_FILL : DEFAULT_FILL;
                        const active = provinceName === info?.province.name;
                        return (
                          <path
                            key={p.id}
                            d={p.d}
                            onClick={(e) => {
                              if (dragRef.current?.moved) return;
                              e.stopPropagation();
                              if (info) {
                                setProvinceName(info.province.name);
                                setRegionName(info.regionName);
                                const choices = locationChoices(info.province);
                                setCities(choices);
                                setSelectedCity(null);
                              }
                            }}
                            className="cursor-pointer transition-colors"
                            fill={active ? "#f59e0b" : base}
                            stroke={active ? "#92400e" : "#94a3b8"}
                            strokeWidth="1"
                            onMouseEnter={(e) => {
                              if (!active) (e.currentTarget as SVGPathElement).style.fill = "#cbd5e1";
                            }}
                            onMouseLeave={(e) => {
                              if (!active) (e.currentTarget as SVGPathElement).style.fill = base;
                            }}
                          />
                        );
                      })}
                    </svg>

                    {/* Zoom controls overlaid on the map (Google Maps style) */}
                    <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-border/50 bg-background/95 shadow-lg">
                      <button
                        type="button"
                        onClick={() => zoomAt(1.4, 0.5, 0.5)}
                        className="p-2.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        aria-label="Zoom in"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <div className="h-px bg-border/60" />
                      <button
                        type="button"
                        onClick={() => zoomAt(0.8, 0.5, 0.5)}
                        className="p-2.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        aria-label="Zoom out"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <div className="h-px bg-border/60" />
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(1);
                          setPan({ x: 0, y: 0 });
                        }}
                        className="p-2.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        aria-label="Reset zoom"
                      >
                        <Maximize className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="mt-2 text-center text-[11px] text-muted-foreground/60">
                      {zoom > 1 ? "Drag to move · tap a province" : "Scroll or pinch to zoom · tap a province"}
                    </p>
                  </div>

                  {/* Selected place + cities */}
                  <div className="min-w-0 flex-1">
                    {!provinceName ? (
                      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-6 text-center">
                        <MapPin className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                          No province selected yet — tap the map to start.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-xl bg-muted/40 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {regionName ?? "Philippines"}
                          </p>
                          <p className="mt-0.5 font-heading text-lg font-bold text-foreground">
                            {provinceName}
                          </p>
                        </div>
                        {cities.length > 0 && (
                          <>
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                              Cities &amp; municipalities ({cities.length})
                            </p>
                            <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                              {cities.map((city) => (
                                <button
                                  key={city}
                                  type="button"
                                  onClick={() => selectPlace(
                                    { name: provinceName!, cities },
                                    regionName,
                                    city
                                  )}
                                  className={cn(
                                    "rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors",
                                    selectedCity === city
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border/60 text-foreground hover:bg-muted/50"
                                  )}
                                >
                                  {city}
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Nearby places — hop to neighboring locations fast */}
                        {(nearbyCities.length > 0 || nearbyProvinces.length > 0) && (
                          <div className="space-y-2">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                              <Navigation className="h-3.5 w-3.5 text-primary" />
                              Nearby
                            </p>
                            {nearbyCities.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {nearbyCities.map((city) => (
                                  <button
                                    key={city}
                                    type="button"
                                    onClick={() => selectPlace(
                                      { name: provinceName!, cities },
                                      regionName,
                                      city
                                    )}
                                    className="rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                                  >
                                    {city}
                                  </button>
                                ))}
                              </div>
                            )}
                            {nearbyProvinces.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {nearbyProvinces.map((p) => (
                                  <button
                                    key={p.name}
                                    type="button"
                                    onClick={() => selectProvinceByName(p.name)}
                                    className="rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                                  >
                                    {p.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* ---------- STEP 2: NEWS FEED (map hidden) ---------- */
            <>
              {/* Location bar + clear */}
              <Card className="border-border/50">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {regionName ?? "Philippines"}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 font-heading text-lg font-bold text-foreground">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" />
                      {loadedLocation ?? `${provinceName}${selectedCity ? `, ${selectedCity}` : ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setArticles([]); setLoadedLocation(null); setLoading(true); setRefreshKey((k) => k + 1); }} disabled={!selectedCity}>
                      <RefreshCwMini />
                      Reload
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearPlace}>
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Category chips — with live counts, instant switching */}
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(({ key, label, icon: Icon }) => {
                  const count = counts?.[key] ?? 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => switchCategory(key)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                        category === key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                      {count > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                            category === key
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* "Walang Pasok" banner — Gemini deep-research summary of the
                  suspension posts, shown only when a suspension is real. */}
              {!loading && suspension?.hasSuspension && (
                <div className="overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-rose-500/10">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                      <Megaphone className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading text-base font-bold text-foreground">
                        Walang Pasok sa {loadedLocation ?? "your area"}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                        {suspension.summary}
                      </p>
                      {suspension.sources.length > 0 && (
                        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                          Source: {suspension.sources.join(", ")}
                        </p>
                      )}
                    </div>
                    <a
                      href={suspension.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/30"
                    >
                      Verify on Facebook
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Feed */}
              <section>
                {loading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <Card key={i} className="border-border/50">
                        <CardContent className="flex gap-3 p-3.5">
                          <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4 rounded" />
                            <Skeleton className="h-3 w-1/3 rounded" />
                            <Skeleton className="h-3 w-full rounded" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : articles.length === 0 ? (
                  <Card className="border-dashed border-border/70">
                    <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                      <Newspaper className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">
                        No news found for this area.
                      </p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        Try a different category or a nearby city/municipality.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {articles.length} news for {loadedLocation}
                    </p>
                    {articles.map((a) => (
                      <ArticleCard key={a.id} article={a} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RefreshCwMini() {
  return (
    <svg className="mr-1.5 h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

function isFaviconFallback(image: string | null): boolean {
  return image ? image.startsWith("https://icon.horse/") : true;
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const isFb = article.platform === "facebook";
  const accountName = article.authorName ?? article.source;
  const avatar = isFb
    ? article.authorAvatar
    : !isFaviconFallback(article.image)
      ? article.image
      : null;
  const bigImage = !isFaviconFallback(article.image) ? article.image : null;

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        {/* Account header — who posted this */}
        <div className="flex items-center gap-2.5">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full bg-muted object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {initialsOf(accountName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-semibold text-foreground hover:text-primary"
            >
              {accountName}
            </a>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              {timeAgo(article.publishedAt)}
              {isFb && (
                <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                  Facebook
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Caption */}
        <a href={article.link} target="_blank" rel="noopener noreferrer" className="group mt-3 block">
          <h3 className="font-heading text-[15px] font-semibold leading-snug text-foreground group-hover:text-primary">
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {article.excerpt}
            </p>
          )}
        </a>

        {/* Image content */}
        {bigImage && (
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="mt-3 block">
            <img
              src={bigImage}
              alt=""
              loading="lazy"
              className="max-h-72 w-full rounded-xl border border-border/40 bg-muted object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function HeaderShell() {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
      <div className="flex items-start gap-3">
        <HeaderAvatar />
        <div className="min-w-0">
          <h1 className="font-heading text-[clamp(1.5rem,1.25rem+1vw,1.875rem)] leading-tight font-bold tracking-tight text-foreground">
            Chika
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Class suspensions, weather alerts, and local news — straight from Facebook.
          </p>
        </div>
      </div>
      <NotificationBell variant="inline" className="hidden md:flex" />
    </header>
  );
}