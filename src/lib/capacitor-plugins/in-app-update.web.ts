import type { InAppUpdatePlugin, UpdateInfo } from "./in-app-update";

export class InAppUpdateWeb implements InAppUpdatePlugin {
  async checkUpdate(): Promise<UpdateInfo> {
    return { hasUpdate: false };
  }
  async downloadAndInstall(): Promise<void> {}
}
