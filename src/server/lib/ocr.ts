import { createWorker } from "tesseract.js";

let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

async function getWorker() {
  if (!worker) {
    worker = await createWorker("eng");
  }
  return worker;
}

export async function ocrImage(buffer: Buffer): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(buffer);
  return data.text.trim();
}
