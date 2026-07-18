"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { upload } from "@vercel/blob/client";
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
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = Boolean((user as Record<string, unknown> | null)?.isAdmin);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/apk")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrent(d?.current ?? null))
      .catch(() => {});
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
    if (!file || !versionName) {
      setMessage({ type: "err", text: "Version name and APK file are required." });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const apkKey = `releases/Schedly-${versionName.replace(/^v/i, "").trim()}-release.apk`;
      const clientPayload = JSON.stringify({
        versionName,
        updateMessage: updateMessage || `New version ${versionName} is now available.`,
      });

      const blob = await upload(apkKey, file, {
        access: "public",
        handleUploadUrl: "/api/admin/apk-token",
        clientPayload,
      });

      setMessage({ type: "ok", text: `Published v${versionName} successfully.` });
      setCurrent({
        versionName: versionName.replace(/^v/i, "").trim(),
        apkUrl: blob.url,
      });
      setFile(null);
      setVersionName("");
      setUpdateMessage("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      console.error(err);
      setMessage({
        type: "err",
        text:
          err instanceof Error
            ? `Upload failed: ${err.message}`
            : "Network error during upload.",
      });
    } finally {
      setUploading(false);
    }
  }

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
            <Input
              id="apk"
              ref={fileRef}
              type="file"
              accept=".apk"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
    </div>
  );
}
