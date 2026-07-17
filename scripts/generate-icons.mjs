import sharp from "sharp";
import { mkdir } from "fs/promises";
import path from "path";

const SRC = path.resolve("public/images/logo.jpg");
const RES_DIR = path.resolve("android/app/src/main/res");

const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
const launcherSizes = [48, 72, 96, 144, 192];
const foregroundSizes = [108, 162, 216, 324, 432];

async function main() {
  for (let i = 0; i < densities.length; i++) {
    const density = densities[i];
    const dir = path.join(RES_DIR, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });

    // Launcher icon (square)
    const launcherSize = launcherSizes[i];
    await sharp(SRC)
      .resize(launcherSize, launcherSize, { fit: "cover" })
      .png()
      .toFile(path.join(dir, "ic_launcher.png"));

    // Round icon (circle clip)
    const roundSize = launcherSizes[i];
    const roundBuffer = Buffer.from(
      `<svg width="${roundSize}" height="${roundSize}"><circle cx="${roundSize / 2}" cy="${roundSize / 2}" r="${roundSize / 2}"/></svg>`
    );
    await sharp(SRC)
      .resize(roundSize, roundSize, { fit: "cover" })
      .composite([{ input: roundBuffer, blend: "dest-in" }])
      .png()
      .toFile(path.join(dir, "ic_launcher_round.png"));

    // Adaptive icon foreground (logo centered in canvas, 66% safe zone)
    const fgSize = foregroundSizes[i];
    const safeZone = Math.round(fgSize * 0.66);

    const logoResized = await sharp(SRC)
      .resize(safeZone, safeZone, { fit: "contain" })
      .png()
      .toBuffer();

    const svgBg = `<svg width="${fgSize}" height="${fgSize}"><rect width="${fgSize}" height="${fgSize}" fill="transparent"/></svg>`;
    const offset = Math.round((fgSize - safeZone) / 2);

    await sharp(Buffer.from(svgBg))
      .composite([{ input: logoResized, left: offset, top: offset }])
      .png()
      .toFile(path.join(dir, "ic_launcher_foreground.png"));

    console.log(`done: ${density}`);
  }

  console.log("\nAll icons generated!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
