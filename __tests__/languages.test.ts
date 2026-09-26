import { canonicalLanguageName, detectLanguageFromText, tesseractCodeFor } from "@/lib/languages";

describe("language registry", () => {
  it.each([
    ["hin", "Hindi"],
    ["HINDI", "Hindi"],
    ["mag", "Magahi"],
    ["npi", "Nepali"],
    ["oriya", "Odia"],
    ["apabhramsha", "Apabhramsa"],
    ["Applied Linguistics", null],
  ])("canonicalLanguageName(%p) -> %p", (input, expected) => {
    expect(canonicalLanguageName(input)).toBe(expected);
  });

  it("maps languages to tesseract codes", () => {
    expect(tesseractCodeFor("Hindi")).toBe("hin");
    expect(tesseractCodeFor("Sanskrit")).toBe("san");
    expect(tesseractCodeFor("Pali")).toBeNull();
  });
});

describe("detectLanguageFromText", () => {
  it("detects Hindi from Devanagari even with Gujarati OCR noise", () => {
    const text = "काबुलीवाला रवीन्द्रनाथ ठाकुर काबुली प्रतिदिन आता रहा। उसने किशमिश, बादाम દે-દેકર वहीं";
    expect(detectLanguageFromText(text)).toBe("Hindi");
  });

  it("detects Gujarati script", () => {
    expect(detectLanguageFromText("ગુજરાતી ભાષા ભારતના ગુજરાત રાજ્યની મુખ્ય ભાષા છે અને")).toBe("Gujarati");
  });

  it("treats Latin text as English unless the Latin guesser says otherwise", () => {
    const text = "Soul Concepts Across Religions: A Comparative Study of the meaning of soul";
    expect(detectLanguageFromText(text)).toBe("English");
    expect(detectLanguageFromText(text, () => "afr")).toBe("Afrikaans");
    expect(detectLanguageFromText(text, () => "und")).toBe("English");
    expect(detectLanguageFromText("La politique hindoue en Italie et en France", () => "fra")).toBe("French");
  });

  it("returns null when there is not enough text", () => {
    expect(detectLanguageFromText("")).toBeNull();
    expect(detectLanguageFromText("  12 34 ")).toBeNull();
    expect(detectLanguageFromText("Vol 3")).toBeNull();
  });
});
