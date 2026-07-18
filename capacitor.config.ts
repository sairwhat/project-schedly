import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.schedly.app",
  appName: "Schedly",
  server: {
    url: "https://app.schedly.shop",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#FFF0F3",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#FFF0F3",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    InAppUpdate: {
      versionUrl: "https://raw.githubusercontent.com/sairwhat/project-schedly/master/version.json",
    },
  },
  android: {
    backgroundColor: "#FFF0F3",
  },
};

export default config;
