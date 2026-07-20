import { describe, it, expect } from "vitest";
import {
  expandDayCode,
  normalizeDays,
  DAY_ABBREVIATIONS,
} from "./day-mapping";

describe("expandDayCode — single days", () => {
  it("maps M to Monday", () => {
    expect(expandDayCode("M").days).toEqual(["monday"]);
  });
  it("maps T to Tuesday", () => {
    expect(expandDayCode("T").days).toEqual(["tuesday"]);
  });
  it("maps W to Wednesday", () => {
    expect(expandDayCode("W").days).toEqual(["wednesday"]);
  });
  it("maps TH to Thursday", () => {
    expect(expandDayCode("TH").days).toEqual(["thursday"]);
  });
  it("maps F to Friday", () => {
    expect(expandDayCode("F").days).toEqual(["friday"]);
  });
  it("maps SAT to Saturday", () => {
    expect(expandDayCode("SAT").days).toEqual(["saturday"]);
  });
  it("maps SUN to Sunday", () => {
    expect(expandDayCode("SUN").days).toEqual(["sunday"]);
  });
  it("is case-insensitive", () => {
    expect(expandDayCode("th").days).toEqual(["thursday"]);
    expect(expandDayCode("Mon").days).toEqual(["monday"]);
  });
});

describe("expandDayCode — combined days", () => {
  it("MW = Monday + Wednesday", () => {
    expect(expandDayCode("MW").days).toEqual(["monday", "wednesday"]);
  });

  // THE BUG FIX: TF must be Tuesday + Friday, never Tuesday + Thursday
  it("TF = Tuesday + Friday (regression guard)", () => {
    expect(expandDayCode("TF").days).toEqual(["tuesday", "friday"]);
    expect(expandDayCode("TF").days).not.toEqual(["tuesday", "thursday"]);
  });

  it("TTH = Tuesday + Thursday", () => {
    expect(expandDayCode("TTH").days).toEqual(["tuesday", "thursday"]);
  });

  it("MWF = Monday + Wednesday + Friday", () => {
    expect(expandDayCode("MWF").days).toEqual([
      "monday",
      "wednesday",
      "friday",
    ]);
  });

  it("MTW = Monday + Tuesday + Wednesday", () => {
    expect(expandDayCode("MTW").days).toEqual([
      "monday",
      "tuesday",
      "wednesday",
    ]);
  });

  it("parses arbitrary combos via greedy tokenizer (MTWTHF)", () => {
    expect(expandDayCode("MTWTHF").days).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]);
  });

  it("prefers two-char token TH over single T+H", () => {
    expect(expandDayCode("TTH").days).toEqual(["tuesday", "thursday"]);
  });
});

describe("expandDayCode — confidence & uncertainty", () => {
  it("returns high confidence for known codes", () => {
    expect(expandDayCode("MWF").confidence).toBe(1);
    expect(expandDayCode("MWF").uncertain).toBe(false);
  });

  it("flags unrecognized input as uncertain with low confidence", () => {
    const res = expandDayCode("XYZ");
    expect(res.uncertain).toBe(true);
    expect(res.confidence).toBe(0);
    expect(res.unknowns.length).toBeGreaterThan(0);
    expect(res.days).toEqual([]);
  });

  it("empty input is uncertain", () => {
    expect(expandDayCode("").uncertain).toBe(true);
  });
});

describe("normalizeDays — array input", () => {
  it("expands an array of codes into canonical days", () => {
    const res = normalizeDays(["MW", "TF"]);
    expect(res.days).toEqual(["monday", "wednesday", "tuesday", "friday"]);
    expect(res.confidence).toBe(1);
  });

  it("accepts full names", () => {
    const res = normalizeDays(["Monday", "friday"]);
    expect(res.days).toEqual(["monday", "friday"]);
  });

  it("de-duplicates days", () => {
    const res = normalizeDays(["M", "Monday", "MW"]);
    expect(res.days).toEqual(["monday", "wednesday"]);
  });

  it("reduces confidence when any token is uncertain", () => {
    const res = normalizeDays(["MW", "???"]);
    expect(res.uncertain).toBe(true);
    expect(res.confidence).toBeLessThan(1);
  });

  it("empty array is uncertain", () => {
    expect(normalizeDays([]).uncertain).toBe(true);
  });
});

describe("DAY_ABBREVIATIONS table", () => {
  it("TF is present and correct", () => {
    expect(DAY_ABBREVIATIONS.TF).toEqual(["tuesday", "friday"]);
  });
  it("does not contain a wrong TF mapping", () => {
    expect(DAY_ABBREVIATIONS.TF).not.toEqual(["tuesday", "thursday"]);
  });
});
