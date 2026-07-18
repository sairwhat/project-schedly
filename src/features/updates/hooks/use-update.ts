"use client";

import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { InAppUpdate } from "@/lib/capacitor-plugins/in-app-update";
import type { UpdateInfo } from "@/lib/capacitor-plugins/in-app-update";

const VERSION_URL =
  "https://raw.githubusercontent.com/sairwhat/project-schedly/main/version.json";

export function useUpdateChecker() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      setChecking(true);
      const info = await InAppUpdate.checkUpdate({ versionUrl: VERSION_URL });
      setUpdateInfo(info);
    } catch {
      setUpdateInfo(null);
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async (apkUrl: string) => {
    try {
      setDownloading(true);
      await InAppUpdate.downloadAndInstall({ apkUrl });
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, []);

  const dismiss = useCallback(() => setUpdateInfo(null), []);

  useEffect(() => {
    check();
  }, [check]);

  return { updateInfo, checking, downloading, downloadAndInstall, dismiss };
}
