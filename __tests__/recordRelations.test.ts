import {
  extractLanguageDisplay,
  extractLanguageNames,
  extractMagazineName,
  formatLanguageLegacy,
  normalizeLanguageMasterName,
  normalizeOptionalText,
  parseLanguageValues,
  withRecordLegacyShape,
} from "@/lib/recordRelations";

describe("recordRelations helpers", () => {
  describe("normalizeOptionalText", () => {
    it("strips JSON-like wrappers and trims values", () => {
      expect(normalizeOptionalText('["English"]')).toBe("English");
      expect(normalizeOptionalText("  Hindi  ")).toBe("Hindi");
      expect(normalizeOptionalText('[""]')).toBeNull();
      expect(normalizeOptionalText("   ")).toBeNull();
      expect(normalizeOptionalText(null)).toBeNull();
    });
  });

  describe("parseLanguageValues", () => {
    it.each([
      [null, []],
      [undefined, []],
      ["", []],
      ['["English"]', ["English"]],
      ["English, Hindi", ["English", "Hindi"]],
      ["English & Gujarati", ["English", "Gujarati"]],
      ["English and Hindi", ["English", "Hindi"]],
      ["English, Hindi & Gujarati", ["English", "Hindi", "Gujarati"]],
      ["English and Hindi and Gujarati", ["English", "Hindi", "Gujarati"]],
      ["english, ENGLISH, hindi", ["English", "Hindi"]],
      ["English, Sanskrit/Prakrit", ["English", "Sanskrit", "Prakrit"]],
      ["Hindi. Gujarati", ["Hindi", "Gujarati"]],
      ["Hindi`", ["Hindi"]],
      ["English, Sanskrit, various", ["English", "Sanskrit"]],
      ["afr, lin, war", ["Afrikaans", "Lingala", "Waray"]],
      ["hin", ["Hindi"]],
      ["Hin", ["Hindi"]],
      ["eng", ["English"]],
      ["guj, san", ["Gujarati", "Sanskrit"]],
      ["English and Applied Linguistics", ["English And Applied Linguistics"]],
    ])("parses %p -> %p", (input, expected) => {
      expect(parseLanguageValues(input as string | null | undefined)).toEqual(expected);
    });
  });

  describe("normalizeLanguageMasterName", () => {
    it("maps aliases to the canonical name", () => {
      expect(normalizeLanguageMasterName("hin")).toEqual({ name: "Hindi" });
      expect(normalizeLanguageMasterName("  sanskrit ")).toEqual({ name: "Sanskrit" });
      expect(normalizeLanguageMasterName("tibetan")).toEqual({ name: "Tibetan" });
    });

    it("rejects combined languages and empty input", () => {
      expect(normalizeLanguageMasterName("English, Hindi")).toHaveProperty("error");
      expect(normalizeLanguageMasterName("English & Sanskrit")).toHaveProperty("error");
      expect(normalizeLanguageMasterName("   ")).toHaveProperty("error");
      expect(normalizeLanguageMasterName(undefined)).toHaveProperty("error");
    });
  });

  describe("formatLanguageLegacy", () => {
    it("builds a sorted, de-duplicated, canonical display string", () => {
      expect(formatLanguageLegacy(["Sanskrit", "English", "eng"])).toBe("English, Sanskrit");
      expect(formatLanguageLegacy([])).toBeNull();
    });
  });

  describe("extractMagazineName", () => {
    it("uses relation first, then legacy fields", () => {
      expect(extractMagazineName({ magazines: { name: "Relational Magazine" }, name_legacy: "Legacy Name" })).toBe(
        "Relational Magazine",
      );
      expect(extractMagazineName({ name_legacy: "Legacy Name" })).toBe("Legacy Name");
      expect(extractMagazineName({})).toBe("");
    });
  });

  describe("extractLanguageNames / extractLanguageDisplay", () => {
    it("prefers relation-based language names and deduplicates", () => {
      const record = {
        language_legacy: "Hindi",
        record_languages: [
          { languages: { id: 1, name: "english" } },
          { languages: { id: 2, name: "Hindi" } },
          { languages: { id: 3, name: "English" } },
        ],
      };

      expect(extractLanguageNames(record)).toEqual(["English", "Hindi"]);
      expect(extractLanguageDisplay(record)).toBe("English, Hindi");
    });

    it("falls back to legacy string parsing when relation rows are absent", () => {
      const record = { language_legacy: "English & Gujarati" };
      expect(extractLanguageNames(record)).toEqual(["English", "Gujarati"]);
      expect(extractLanguageDisplay(record)).toBe("English, Gujarati");
    });
  });

  describe("withRecordLegacyShape", () => {
    it("keeps record fields and adds backward-compatible name/language", () => {
      const result = withRecordLegacyShape({
        id: 10,
        title_name: "Article",
        magazines: { id: 7, name: "Journal A" },
        record_languages: [{ languages: { id: 2, name: "Hindi" } }],
      });

      expect(result.id).toBe(10);
      expect(result.name).toBe("Journal A");
      expect(result.language).toBe("Hindi");
    });
  });
});
