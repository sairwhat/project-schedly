let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | null = null;

async function getWorker() {
  if (worker) return worker;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng");
    return worker;
  } catch {
    return null;
  }
}

export async function ocrImage(buffer: Buffer): Promise<string> {
  try {
    const w = await getWorker();
    if (!w) return "";
    const { data } = await w.recognize(buffer);
    return data.text.trim();
  } catch {
    return "";
  }
}
