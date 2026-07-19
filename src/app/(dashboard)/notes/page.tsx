"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StickyNote,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";

type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "schedly-notes";

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[] | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const persist = useCallback((next: Note[]) => {
    setNotes(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addNote = () => {
    if (!title.trim() && !body.trim()) return;
    setSaving(true);
    const now = Date.now();
    const note: Note = {
      id: now.toString(36) + Math.random().toString(36).slice(2, 7),
      title: title.trim() || "Untitled",
      body: body.trim(),
      createdAt: now,
      updatedAt: now,
    };
    persist([note, ...(notes || [])]);
    setTitle("");
    setBody("");
    setSaving(false);
  };

  const deleteNote = (id: string) => {
    persist((notes || []).filter((n) => n.id !== id));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Notes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Jot down quick thoughts and study notes.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="space-y-3 pt-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            maxLength={80}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write something..."
            className="flex min-h-[100px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button onClick={addNote} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" /> Add note</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-3">
        {notes === null ? (
          <>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-14 text-center">
            <StickyNote className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No notes yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Add your first note above to get started.
            </p>
          </div>
        ) : (
          notes.map((n) => (
            <Card key={n.id} className="border-border/50">
              <CardContent className="flex items-start gap-3 pt-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {n.body}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteNote(n.id)}
                  aria-label="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
