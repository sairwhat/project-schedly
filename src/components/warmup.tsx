"use client";

import { useEffect } from "react";
import { warmup } from "@/lib/warmup";

export function Warmup() {
  useEffect(() => { warmup(); }, []);
  return null;
}
