"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Upload,
  Search,
  Music,
  ListMusic,
  Trash2,
} from "lucide-react";

interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  data: string;
  uploadedAt: number;
  color: [string, string];
}

const GRADIENTS: [string, string][] = [
  ["#ff6b6b", "#ee5a24"],
  ["#a29bfe", "#6c5ce7"],
  ["#fd79a8", "#e84393"],
  ["#00cec9", "#00b894"],
  ["#fdcb6e", "#e17055"],
  ["#74b9ff", "#0984e3"],
  ["#55efc4", "#00b894"],
  ["#fab1a0", "#e17055"],
  ["#81ecec", "#00cec9"],
  ["#dfe6e9", "#b2bec3"],
];

function fmtTime(s: number) {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.floor(Math.max(0, s) % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function getColor(title: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

function makeArtwork(color: [string, string]): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, color[0]);
  grad.addColorStop(1, color[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "120px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("♪", 128, 138);
  return c.toDataURL("image/png");
}

const DB_NAME = "schedly-music";
const DB_VERSION = 1;
const STORE_NAME = "songs";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSongs(): Promise<Song[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function saveSong(song: Song): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(song);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteSongFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export default function MusicPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [showUploading, setShowUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSongs()
      .then((s) => { setSongs(s); setLoading(false); })
      .catch(() => { setSongs([]); setLoading(false); });
  }, []);

  useEffect(() => {
    let a: HTMLAudioElement;
    try {
      a = new Audio();
    } catch {
      return;
    }
    audioRef.current = a;
    a.volume = muted ? 0 : volume;

    const onTime = () => setProgress(a.currentTime);
    const onDuration = () => setDuration(a.duration || 0);
    const onEnd = () => {
      if (repeat === "one") {
        a.currentTime = 0;
        a.play().catch(() => {});
      } else {
        nextTrack();
      }
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("durationchange", onDuration);
    a.addEventListener("ended", onEnd);

    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("durationchange", onDuration);
      a.removeEventListener("ended", onEnd);
      a.pause();
      a.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, songs]);

  useEffect(() => {
    const a = audioRef.current;
    const song = currentIndex >= 0 ? songs[currentIndex] : null;
    if (!a || !song) return;
    try {
      a.src = song.data;
      a.load();
      if (playing) a.play().catch(() => setPlaying(false));
    } catch {
      queueMicrotask(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const currentSong = currentIndex >= 0 ? songs[currentIndex] : null;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    if (!currentSong) {
      try {
        ms.metadata = null;
        ms.playbackState = "none";
      } catch {}
      return;
    }

    try {
      ms.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album || "Schedly Music",
        artwork: [
          { src: makeArtwork(currentSong.color), sizes: "256x256", type: "image/png" },
        ],
      });
      ms.playbackState = playing ? "playing" : "paused";
    } catch {}

    const setHandler = (action: MediaSessionAction, handler: (() => void) | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {}
    };

    setHandler("play", () => togglePlay());
    setHandler("pause", () => togglePlay());
    setHandler("previoustrack", () => prevTrack());
    setHandler("nexttrack", () => nextTrack());

    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("previoustrack", null);
      setHandler("nexttrack", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong, playing, songs, shuffle, repeat]);

  function updateMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const song = currentIndex >= 0 ? songs[currentIndex] : null;
    if (!song) {
      try {
        ms.metadata = null;
        ms.playbackState = "none";
      } catch {}
      return;
    }
    try {
      ms.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album || "Schedly Music",
        artwork: [{ src: makeArtwork(song.color), sizes: "256x256", type: "image/png" }],
      });
      ms.playbackState = playing ? "playing" : "paused";
    } catch {}
  }

  function playSong(index: number) {
    if (index < 0 || index >= songs.length) return;
    if (index === currentIndex && playing) return;
    setCurrentIndex(index);
    setPlaying(true);
    setProgress(0);
    setDuration(0);
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = "playing";
      } catch {}
    }
  }

  function togglePlay() {
    if (!audioRef.current || currentIndex < 0) {
      if (songs.length > 0) playSong(0);
      return;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        try { navigator.mediaSession.playbackState = "paused"; } catch {}
      }
    } else {
      audioRef.current.play()
        .then(() => {
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            try { navigator.mediaSession.playbackState = "playing"; } catch {}
          }
        })
        .catch(() => setPlaying(false));
      setPlaying(true);
    }
  }

  function nextTrack() {
    if (songs.length === 0) return;
    let idx: number;
    if (shuffle) {
      idx = Math.floor(Math.random() * songs.length);
    } else {
      idx = (currentIndex + 1) % songs.length;
    }
    if (repeat === "off" && idx <= currentIndex && idx === 0) {
      if (currentIndex === songs.length - 1) {
        setPlaying(false);
        setProgress(0);
        return;
      }
    }
    playSong(idx);
  }

  function prevTrack() {
    if (songs.length === 0) return;
    const a = audioRef.current;
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    let idx: number;
    if (shuffle) {
      idx = Math.floor(Math.random() * songs.length);
    } else {
      idx = (currentIndex - 1 + songs.length) % songs.length;
    }
    playSong(idx);
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * duration;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setShowUploading(true);
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        if (!data) return;
        const title = file.name.replace(/\.[^/.]+$/, "");
        const addSong = (duration: number) => {
          const song: Song = {
            id: crypto.randomUUID(),
            title,
            artist: "Unknown Artist",
            duration,
            data,
            uploadedAt: Date.now(),
            color: getColor(title),
          };
          saveSong(song).catch(() => {});
          setSongs((prev) => [...prev, song]);
        };
        try {
          const audio = new Audio(data);
          const done = () => addSong(isFinite(audio.duration) ? audio.duration : 0);
          audio.addEventListener("loadedmetadata", done, { once: true });
          audio.addEventListener("error", () => addSong(0), { once: true });
          audio.load();
        } catch {
          addSong(0);
        }
      };
      reader.onerror = () => {};
      reader.readAsDataURL(file);
    });
    e.target.value = "";
    setTimeout(() => setShowUploading(false), 1500);
  }

  async function removeSong(id: string) {
    await deleteSongFromDB(id);
    setSongs((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === currentIndex) {
        setCurrentIndex(-1);
        setPlaying(false);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
      } else if (idx < currentIndex) {
        setCurrentIndex((c) => c - 1);
      }
      return prev.filter((s) => s.id !== id);
    });
  }

  const filtered = songs.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.artist.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="mx-auto flex h-full w-full max-w-lg items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col">
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-1 pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Music</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} title="Upload music">
            <Upload className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative my-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search songs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-xl border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/30"
        />
      </div>

      {/* Song count */}
      <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <ListMusic className="h-3.5 w-3.5" />
        <span>{filtered.length} song{filtered.length !== 1 ? "s" : ""}</span>
        {showUploading && <span className="ml-auto text-primary animate-pulse">Uploading...</span>}
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto -mx-1 pb-2">
        {filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Music className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Your music library is empty</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Upload your music files to start listening
            </p>
            <Button className="mt-5" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload Music
            </Button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((song) => {
              const realIndex = songs.indexOf(song);
              const isActive = realIndex === currentIndex;
              const grad = song.color;
              return (
                <div
                  key={song.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => playSong(realIndex)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") playSong(realIndex); }}
                  className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                    isActive ? "bg-primary/5" : ""
                  }`}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${grad[0]} 0%, ${grad[1]} 100%)` }}
                  >
                    {isActive && playing ? (
                      <div className="flex items-end gap-[2px] h-4">
                        <span className="w-[3px] bg-white/80 rounded-full animate-[music-bar_0.8s_ease-in-out_infinite]" style={{ height: "60%" }} />
                        <span className="w-[3px] bg-white/80 rounded-full animate-[music-bar_0.8s_ease-in-out_infinite_0.2s]" style={{ height: "100%" }} />
                        <span className="w-[3px] bg-white/80 rounded-full animate-[music-bar_0.8s_ease-in-out_infinite_0.4s]" style={{ height: "40%" }} />
                      </div>
                    ) : (
                      <Music className="h-5 w-5 text-white/70" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${isActive ? "text-primary" : "text-foreground"}`}>
                      {song.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {song.duration ? fmtTime(song.duration) : "--:--"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSong(song.id); }}
                      className="shrink-0 text-muted-foreground/40 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Now playing bar (Spotify-style, fixed at bottom of page) */}
      {currentSong && (
        <div className="mb-6 mt-2 flex shrink-0 items-center gap-3 rounded-2xl border border-border/50 bg-card/80 px-4 py-3 shadow-lg backdrop-blur-xl">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `linear-gradient(135deg, ${currentSong.color[0]} 0%, ${currentSong.color[1]} 100%)` }}
          >
            {playing ? (
              <div className="flex items-end gap-[2px] h-5">
                <span className="w-[3px] bg-white/80 rounded-full animate-[music-bar_0.8s_ease-in-out_infinite]" style={{ height: "60%" }} />
                <span className="w-[3px] bg-white/80 rounded-full animate-[music-bar_0.8s_ease-in-out_infinite_0.2s]" style={{ height: "100%" }} />
                <span className="w-[3px] bg-white/80 rounded-full animate-[music-bar_0.8s_ease-in-out_infinite_0.4s]" style={{ height: "40%" }} />
              </div>
            ) : (
              <Music className="h-6 w-6 text-white/70" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{currentSong.title}</p>
            <p className="truncate text-xs text-muted-foreground">{currentSong.artist}</p>
            <div className="mt-1 h-1 cursor-pointer rounded-full bg-muted" onClick={seek}>
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
              />
            </div>
          </div>
          <button
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
        </div>
      )}
    </div>
  );
}
