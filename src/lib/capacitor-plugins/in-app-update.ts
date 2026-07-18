import { registerPlugin } from "@capacitor/core";

export interface UpdateInfo {
  hasUpdate: boolean;
  versionName?: string;
  versionCode?: number;
  apkUrl?: string;
  updateMessage?: string;
}

export interface InAppUpdatePlugin {
  checkUpdate(options: { versionUrl: string }): Promise<UpdateInfo>;
  downloadAndInstall(options: { apkUrl: string }): Promise<void>;
}

export const InAppUpdate = registerPlugin<InAppUpdatePlugin>("InAppUpdate", {
  web: () =>
    import("./in-app-update.web").then((m) => new m.InAppUpdateWeb()),
});
