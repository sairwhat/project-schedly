"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Upload,
  Music,
  Volume2,
  Volume1,
  VolumeX,
  ListMusic,
  Trash2,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SongMeta {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  size: number;
  addedAt: number;
}

type RepeatMode = "off" | "all" | "one";

function loadAll(): SongMeta[] {
  try {
    const raw = localStorage.getItem("schedly-music-meta");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAll(meta: SongMeta[]) {
  localStorage.setItem("schedly-music-meta", JSON.stringify(meta));
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PALETTES = [
  ["#FF6B6B", "#C0392B"], ["#F39C12", "#E67E22"], ["#2ECC71", "#27AE60"],
  ["#3498DB", "#2980B9"], ["#9B59B6", "#8E44AD"], ["#1ABC9C", "#16A085"],
  ["#E74C3C", "#C0392B"], ["#F1C40F", "#F39C12"], ["#34495E", "#2C3E50"],
  ["#FF9FF3", "#F368E0"], ["#48DBFB", "#0ABDE3"], ["#FFA502", "#FF6348"],
  ["#7BED9F", "#2ED573"], ["#70A1FF", "#1E90FF"], ["#FF4757", "#C0392B"],
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const c = PALETTES[Math.abs(hash) % PALETTES.length]!;
  return `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MusicPage() {
  const [songs, setSongs] = useState<SongMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffled, setShuffled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  const currentIdRef = useRef<string | null>(null);
  const repeatModeRef = useRef<RepeatMode>("off");
  const shuffledRef = useRef(false);

  currentIdRef.current = currentId;
  repeatModeRef.current = repeatMode;
  shuffledRef.current = shuffled;

  useEffect(() => { setSongs(loadAll()); setLoaded(true); }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime);
    const onDur = () => setDuration(el.duration || 0);
    const onEnd = () => {
      const list = songsRef.current;
      const currId = currentIdRef.current;
      if (list.length === 0 || !currId) return;
      const idx = list.findIndex((s) => s.id === currId);
      if (idx < 0) return;

      if (repeatModeRef.current === "one") {
        el.currentTime = 0;
        el.play().catch(() => {});
        return;
      }
      let next: number;
      if (shuffledRef.current) {
        next = Math.floor(Math.random() * list.length);
      } else {
        next = idx + 1;
        if (next >= list.length) {
          if (repeatModeRef.current === "all") { next = 0; }
          else { setCurrentId(null); setPlaying(false); el.src = ""; return; }
        }
      }
      playFileById(list[next]!.id);
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("durationchange", onDur);
    el.addEventListener("ended", onEnd);
    el.addEventListener("play", () => setPlaying(true));
    el.addEventListener("pause", () => setPlaying(false));

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("durationchange", onDur);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const songsRef = useRef<SongMeta[]>([]);
  songsRef.current = songs;

  function playFileById(id: string) {
    setErrorMsg(null);
    const file = fileMapRef.current.get(id);
    if (!file) {
      const msg = `File not found: ${id}`;
      console.error(msg);
      setErrorMsg(msg);
      return;
    }

    const el = audioRef.current;
    if (!el) {
      const msg = "Audio element not ready";
      console.error(msg);
      setErrorMsg(msg);
      return;
    }

    console.log("Loading file:", file.name, "type:", file.type, "size:", file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        const msg = "FileReader returned empty result";
        console.error(msg);
        setErrorMsg(msg);
        return;
      }
      console.log("File read successfully, data URL length:", dataUrl.length);
      setCurrentId(id);
      el.src = dataUrl;
      el.currentTime = 0;
      el.play().then(() => {
        console.log("Playback started successfully");
        setErrorMsg(null);
      }).catch((err) => {
        const msg = `Playback failed: ${err.message || err}`;
        console.error(msg);
        setErrorMsg(msg);
        setPlaying(false);
      });
    };
    reader.onerror = () => {
      const msg = "FileReader error: could not read file";
      console.error(msg);
      setErrorMsg(msg);
    };
    reader.readAsDataURL(file);
  }

  function handleSongClick(id: string) {
    console.log("Song clicked:", id);
    if (id === currentIdRef.current) {
      const el = audioRef.current;
      if (!el) return;
      if (el.paused) {
        el.play().catch((err) => {
          setErrorMsg(`Play failed: ${err.message}`);
          setPlaying(false);
        });
      } else {
        el.pause();
      }
    } else {
      playFileById(id);
    }
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (!currentIdRef.current && songs.length > 0) {
      playFileById(songs[0]!.id);
      return;
    }
    if (el.paused) {
      el.play().catch((err) => {
        setErrorMsg(`Play failed: ${err.message}`);
        setPlaying(false);
      });
    } else {
      el.pause();
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
  }

  function prevSong() {
    const list = songs;
    if (list.length === 0) return;
    const el = audioRef.current;
    if (el && el.currentTime > 3) { el.currentTime = 0; return; }
    const idx = list.findIndex((s) => s.id === currentIdRef.current);
    if (shuffled) { playFileById(list[Math.floor(Math.random() * list.length)]!.id); return; }
    const prev = idx - 1;
    if (prev < 0) { if (repeatMode === "all") playFileById(list[list.length - 1]!.id); }
    else { playFileById(list[prev]!.id); }
  }

  function nextSong() {
    const list = songs;
    if (list.length === 0) return;
    const idx = list.findIndex((s) => s.id === currentIdRef.current);
    if (shuffled) { playFileById(list[Math.floor(Math.random() * list.length)]!.id); return; }
    const next = idx + 1;
    if (next >= list.length) { if (repeatMode === "all") playFileById(list[0]!.id); }
    else { playFileById(list[next]!.id); }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setErrorMsg(null);
    const newMeta: SongMeta[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (!file.type.startsWith("audio/")) continue;
      const id = crypto.randomUUID();
      const name = file.name.replace(/\.[^/.]+$/, "");
      fileMapRef.current.set(id, file);
      newMeta.push({ id, name, artist: "Unknown Artist", album: "Unknown Album", duration: 0, size: file.size, addedAt: Date.now() });
    }
    const updated = [...songs, ...newMeta];
    setSongs(updated);
    saveAll(updated);
    if (fileInputRef.current) fileInputRef.current.value = "";
    console.log("Uploaded files, fileMap size:", fileMapRef.current.size);
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    fileMapRef.current.delete(id);
    const updated = songs.filter((s) => s.id !== id);
    setSongs(updated);
    saveAll(updated);
    if (currentIdRef.current === id) {
      setCurrentId(null); setPlaying(false);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    }
  }

  const currentSong = songs.find((s) => s.id === currentId) || null;
  const filteredSongs = songs.filter(
    (s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <audio ref={audioRef} preload="auto" />

      <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleUpload} />

      <div className="flex items-center justify-between px-1 pb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Music</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{songs.length} song{songs.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search songs..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-40 rounded-full border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/30 sm:w-52" />
          </div>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 rounded-full">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{errorMsg}</div>
      )}

      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        {!loaded ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredSongs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Music className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">{searchQuery ? "No songs found" : "Your music library is empty"}</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">{searchQuery ? "Try a different search term" : "Upload your music files to start listening"}</p>
            {!searchQuery && (
              <Button className="mt-5 rounded-full" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Upload Music
              </Button>
            )}
          </div>
        ) : (
          <div className="flex-1 space-y-1 overflow-y-auto rounded-2xl border border-border/50 bg-card/50 p-2">
            {filteredSongs.map((song) => {
              const isActive = song.id === currentId;
              return (
                <div key={song.id} onClick={() => handleSongClick(song.id)}
                  className={cn("group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors", isActive ? "bg-primary/10 text-primary" : "hover:bg-accent/50")}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold shadow-sm" style={{ background: getGradient(song.name) }}>
                    {isActive && playing ? (
                      <div className="flex items-end gap-[2px] h-4">
                        <span className="w-[3px] bg-white rounded-full animate-[musicBar_1s_ease_infinite]" style={{ height: '60%' }} />
                        <span className="w-[3px] bg-white rounded-full animate-[musicBar_1s_ease_infinite_0.15s]" style={{ height: '100%' }} />
                        <span className="w-[3px] bg-white rounded-full animate-[musicBar_1s_ease_infinite_0.3s]" style={{ height: '40%' }} />
                      </div>
                    ) : song.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", isActive ? "text-primary" : "text-foreground")}>{song.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(song.size)}</span>
                  <button onClick={(e) => handleDelete(song.id, e)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" aria-label="Delete song">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {currentSong && (
        <div className={cn("mt-4 rounded-2xl border border-border/50 transition-all duration-300", showFullPlayer ? "flex-1 overflow-y-auto p-6" : "p-3")}>
          {showFullPlayer ? (
            <div className="flex flex-col items-center gap-6">
              <div className="flex w-full items-center justify-between">
                <button onClick={() => setShowFullPlayer(false)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-5 w-5" /> Now Playing
                </button>
                <ListMusic className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="h-64 w-64 rounded-3xl shadow-xl sm:h-80 sm:w-80" style={{ background: getGradient(currentSong.name) }}>
                <div className="flex h-full w-full items-center justify-center"><Music className="h-20 w-20 text-white/40" /></div>
              </div>
              <div className="w-full max-w-sm text-center">
                <h2 className="text-xl font-bold text-foreground truncate">{currentSong.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{currentSong.artist}</p>
              </div>
              <div className="w-full max-w-sm space-y-1.5">
                <input type="range" min={0} max={duration || 100} value={currentTime} onChange={seek}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => setShuffled(!shuffled)} className={cn("rounded-full p-2 transition-colors", shuffled ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                  <Shuffle className="h-5 w-5" />
                </button>
                <button onClick={prevSong} className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"><SkipBack className="h-6 w-6" /></button>
                <button onClick={togglePlay}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95">
                  {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
                </button>
                <button onClick={nextSong} className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"><SkipForward className="h-6 w-6" /></button>
                <button onClick={() => setRepeatMode(repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off")}
                  className={cn("relative rounded-full p-2 transition-colors", repeatMode !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {repeatMode === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
                  {repeatMode === "one" && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">1</span>}
                </button>
              </div>
              <div className="flex w-full max-w-xs items-center gap-2">
                <button onClick={() => setMuted(!muted)} className="text-muted-foreground hover:text-foreground">
                  {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : volume < 0.5 ? <Volume1 className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
                  onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white text-sm font-bold shadow-sm" style={{ background: getGradient(currentSong.name) }}>
                {playing ? (
                  <div className="flex items-end gap-[2px] h-5">
                    <span className="w-[3px] bg-white rounded-full animate-[musicBar_0.8s_ease_infinite]" style={{ height: '60%' }} />
                    <span className="w-[3px] bg-white rounded-full animate-[musicBar_0.8s_ease_infinite_0.15s]" style={{ height: '100%' }} />
                    <span className="w-[3px] bg-white rounded-full animate-[musicBar_0.8s_ease_infinite_0.3s]" style={{ height: '40%' }} />
                  </div>
                ) : currentSong.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setShowFullPlayer(true)}>
                <p className="truncate text-sm font-medium text-foreground">{currentSong.name}</p>
                <p className="truncate text-xs text-muted-foreground">{currentSong.artist} &middot; {formatTime(currentTime)} / {formatTime(duration)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={prevSong} className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"><SkipBack className="h-5 w-5" /></button>
                <button onClick={togglePlay}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95">
                  {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                </button>
                <button onClick={nextSong} className="rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"><SkipForward className="h-5 w-5" /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
