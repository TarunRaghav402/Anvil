import { describe, expect, it } from "vitest";
import { normalizeNodeName, validateNodeNameClient } from "../src/utils/filenames";

describe("Frontend cross-OS filename validation", () => {
  it("rejects Windows reserved names and illegal characters", () => {
    expect(validateNodeNameClient("CON").valid).toBe(false);
    expect(validateNodeNameClient("nul.json").valid).toBe(false);
    expect(validateNodeNameClient("LPT2.png").valid).toBe(false);
    expect(validateNodeNameClient("file<1>.js").valid).toBe(false);
    expect(validateNodeNameClient("trailing.").valid).toBe(false);
    expect(validateNodeNameClient("trailing ").valid).toBe(false);
  });

  it("normalizes macOS NFD Unicode strings to NFC", () => {
    expect(normalizeNodeName("e\u0301.png")).toBe("\u00e9.png");
    const res = validateNodeNameClient("sprite_e\u0301.png");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("sprite_\u00e9.png");
  });
});
