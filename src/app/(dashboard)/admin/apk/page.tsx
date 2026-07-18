"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

type VersionInfo = {
  versionCode?: number;
  versionName?: string;
  apkUrl?: string;
  updateMessage?: string;
};

type LogLine = {
  ts: string;
  level: "info" | "ok" | "err" | "warn";
  text: string;
};

function now() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export default function AdminApkPage() {
  const { user } = useAuth();
  const [versionName, setVersionName] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [current, setCurrent] = useState<VersionInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = Boolean((user as Record<string, unknown> | null)?.isAdmin);

  const pushLog = (level: LogLine["level"], text: string) => {
    setLogs((prev) => [...prev, { ts: now(), level, text }]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!isAdmin) return;
    pushLog("info", "Fetching current live version...");
    fetch("/api/admin/apk")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const cur = d?.current ?? null;
        setCurrent(cur);
        if (cur?.versionName) {
          pushLog("ok", `Current live version: v${cur.versionName} (code ${cur.versionCode})`);
        } else {
          pushLog("warn", "No release published yet.");
        }
      })
      .catch(() => pushLog("err", "Failed to fetch current version."));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>
              You need admin privileges to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  async function handleUpload() {
    const selectedFile = file ?? fileRef.current?.files?.[0] ?? null;
    const cleanVersion = versionName.trim();
    if (!selectedFile || !cleanVersion) {
      setMessage({ type: "err", text: "Version name and APK file are required." });
      pushLog("err", `Validation failed: version="${cleanVersion}" file=${selectedFile ? selectedFile.name : "none"}`);
      return;
    }
    setUploading(true);
    setMessage(null);
    setLogs([]);
    pushLog("info", `Preparing release v${cleanVersion}...`);
    pushLog("info", `File: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("versionName", cleanVersion);
      form.append("updateMessage", updateMessage);

      pushLog("info", "Uploading to Blob via server...");
      const result = await new Promise<{ ok: boolean; url?: string; error?: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/admin/apk-upload");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const p = Math.round((e.loaded / e.total) * 100);
              pushLog("info", `Uploading... ${p}%`);
            }
          };
          xhr.onload = () => {
            try {
              const body = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
                resolve(body);
              } else {
                reject(new Error(body.error || `Server error ${xhr.status}`));
              }
            } catch {
              reject(new Error(`Server error ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("Network error during upload."));
          xhr.send(form);
        }
      );

      pushLog("ok", "APK uploaded to Blob storage.");
      pushLog("ok", "Server wrote releases/version.json.");
      pushLog("ok", `Published v${cleanVersion} successfully.`);
      pushLog("ok", `APK URL: ${result.url}`);

      setMessage({ type: "ok", text: `Published v${cleanVersion} successfully.` });
      setCurrent({
        versionName: cleanVersion.replace(/^v/i, "").trim(),
        apkUrl: result.url,
      });
      setFile(null);
      setVersionName("");
      setUpdateMessage("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      console.error(err);
      const text =
        err instanceof Error ? err.message : "Network error during upload.";
      pushLog("err", `Upload failed: ${text}`);
      setMessage({
        type: "err",
        text: `Upload failed: ${text}`,
      });
    } finally {
      setUploading(false);
    }
  }

  const logColor: Record<LogLine["level"], string> = {
    info: "text-slate-300",
    ok: "text-green-400",
    err: "text-red-400",
    warn: "text-yellow-400",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">APK Release Manager</h1>
        <p className="text-sm text-muted-foreground">
          Upload a signed release APK. The app will auto-detect the new version
          and prompt users to update.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current live version</CardTitle>
          <CardDescription>
            {current?.versionName
              ? `v${current.versionName} (code ${current.versionCode})`
              : "No release published yet."}
          </CardDescription>
        </CardHeader>
        {current?.apkUrl && (
          <CardContent>
            <a
              href={current.apkUrl}
              className="text-sm text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              Download current APK
            </a>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publish new version</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="versionName">Version name (e.g. 1.4)</Label>
            <Input
              id="versionName"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="1.4"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="updateMessage">Update message</Label>
            <Input
              id="updateMessage"
              value={updateMessage}
              onChange={(e) => setUpdateMessage(e.target.value)}
              placeholder="Bug fixes and improvements"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apk">APK file</Label>
            <input
              id="apk"
              ref={fileRef}
              type="file"
              accept=".apk"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) pushLog("info", `Selected: ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`);
              }}
              className="block w-full cursor-pointer rounded-lg border border-border bg-transparent text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {message && (
            <p
              className={
                message.type === "ok"
                  ? "text-sm text-green-600"
                  : "text-sm text-red-600"
              }
            >
              {message.text}
            </p>
          )}

          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? "Publishing..." : "Publish release"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Build &amp; Upload Log
          </CardTitle>
          <CardDescription>
            Live terminal output of the release process.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-slate-500">Waiting for action...</p>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 text-slate-600">[{l.ts}]</span>
                  <span className={logColor[l.level]}>{l.text}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
