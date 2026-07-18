import { Music } from "lucide-react";

export default function MusicPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Music className="h-8 w-8 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">Your music library is empty</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Upload your music files to start listening
        </p>
      </div>
    </div>
  );
}
