"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateChecker } from "../hooks/use-update";

export function UpdateDialog() {
  const { updateInfo, downloading, downloadAndInstall, dismiss } =
    useUpdateChecker();

  if (!updateInfo?.hasUpdate) return null;

  return (
    <Dialog open={true} onOpenChange={() => dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Available</DialogTitle>
          <DialogDescription>
            Version {updateInfo.versionName} is now available.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {updateInfo.updateMessage}
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => dismiss()}>
            Later
          </Button>
          <Button
            onClick={() =>
              updateInfo.apkUrl && downloadAndInstall(updateInfo.apkUrl)
            }
            disabled={downloading}
          >
            {downloading ? "Downloading..." : "Update"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
