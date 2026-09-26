// Canonical language registry. Every language name written to the `languages`
// table should come from here, so the same language is never stored twice
// under different spellings or as a raw ISO code ("Hin", "Mag", "Npi", ...).

type LanguageEntry = {
  name: string;
  /** Aliases: ISO 639-1/2/3 codes and alternate spellings (lowercase). */
  aliases: string[];
  /** Tesseract traineddata code, when OCR supports the language. */
  tesseract?: string;
};

const LANGUAGES: LanguageEntry[] = [
  { name: "English", aliases: ["en", "eng"], tesseract: "eng" },
  { name: "Hindi", aliases: ["hi", "hin"], tesseract: "hin" },
  { name: "Sanskrit", aliases: ["sa", "san", "samskrit", "samskrita"], tesseract: "san" },
  { name: "Prakrit", aliases: ["pra", "prakrta", "ardhamagadhi"], tesseract: "hin" },
  { name: "Apabhramsa", aliases: ["apabhramsha", "apabhransh", "apabhramsh"], tesseract: "hin" },
  { name: "Pali", aliases: ["pi", "pli"] },
  { name: "Gujarati", aliases: ["gu", "guj"], tesseract: "guj" },
  { name: "Marathi", aliases: ["mr", "mar"], tesseract: "mar" },
  { name: "Bengali", aliases: ["bn", "ben", "bangla"], tesseract: "ben" },
  { name: "Kannada", aliases: ["kn", "kan"], tesseract: "kan" },
  { name: "Telugu", aliases: ["te", "tel"], tesseract: "tel" },
  { name: "Tamil", aliases: ["ta", "tam"], tesseract: "tam" },
  { name: "Malayalam", aliases: ["ml", "mal"], tesseract: "mal" },
  { name: "Punjabi", aliases: ["pa", "pan", "panjabi"], tesseract: "pan" },
  { name: "Odia", aliases: ["or", "ori", "ory", "oriya"], tesseract: "ori" },
  { name: "Assamese", aliases: ["as", "asm"], tesseract: "asm" },
  { name: "Urdu", aliases: ["ur", "urd"], tesseract: "urd" },
  { name: "Persian", aliases: ["fa", "fas", "per", "farsi"], tesseract: "fas" },
  { name: "Arabic", aliases: ["ar", "ara"], tesseract: "ara" },
  { name: "Chinese", aliases: ["zh", "zho", "chi", "cmn"], tesseract: "chi_sim" },
  { name: "Tibetan", aliases: ["bo", "bod", "tib"], tesseract: "bod" },
  { name: "Japanese", aliases: ["ja", "jpn"], tesseract: "jpn" },
  { name: "Nepali", aliases: ["ne", "nep", "npi"], tesseract: "nep" },
  { name: "Sindhi", aliases: ["sd", "snd"], tesseract: "snd" },
  { name: "Kashmiri", aliases: ["ks", "kas"] },
  { name: "Konkani", aliases: ["kok"] },
  { name: "Maithili", aliases: ["mai"] },
  { name: "Magahi", aliases: ["mag"] },
  { name: "Bhojpuri", aliases: ["bho"] },
  { name: "Rajasthani", aliases: ["raj"] },
  { name: "Dogri", aliases: ["doi"] },
  { name: "Bodo", aliases: ["brx"] },
  { name: "Manipuri", aliases: ["mni", "meitei"] },
  { name: "Santhali", aliases: ["sat", "santali"] },
  { name: "Sinhala", aliases: ["si", "sin", "sinhalese"], tesseract: "sin" },
  { name: "Burmese", aliases: ["my", "mya", "bur"], tesseract: "mya" },
  { name: "Thai", aliases: ["th", "tha"], tesseract: "tha" },
  { name: "French", aliases: ["fr", "fra", "fre"], tesseract: "fra" },
  { name: "German", aliases: ["de", "deu", "ger"], tesseract: "deu" },
  { name: "Italian", aliases: ["it", "ita"], tesseract: "ita" },
  { name: "Spanish", aliases: ["es", "spa"], tesseract: "spa" },
  { name: "Portuguese", aliases: ["pt", "por"], tesseract: "por" },
  { name: "Greek", aliases: ["el", "ell", "gre"], tesseract: "ell" },
  { name: "Latin", aliases: ["la", "lat"], tesseract: "lat" },
  { name: "Afrikaans", aliases: ["af", "afr"] },
  { name: "Lingala", aliases: ["ln", "lin"] },
  { name: "Waray", aliases: ["war"] },
  { name: "Hausa", aliases: ["ha", "hau"] },
];

const ENTRY_BY_KEY = new Map<string, LanguageEntry>();
for (const entry of LANGUAGES) {
  ENTRY_BY_KEY.set(entry.name.toLowerCase(), entry);
  for (const alias of entry.aliases) ENTRY_BY_KEY.set(alias, entry);
}

/** Canonical name for a language token ("hin", "HINDI", "Hindi" -> "Hindi"), or null if unknown. */
export function canonicalLanguageName(token: string | null | undefined): string | null {
  if (!token) return null;
  const key = token.trim().toLowerCase();
  return ENTRY_BY_KEY.get(key)?.name ?? null;
}

export function isKnownLanguage(token: string | null | undefined): boolean {
  return canonicalLanguageName(token) !== null;
}

/** Tesseract OCR code for a language name/alias, or null when OCR has no model for it. */
export function tesseractCodeFor(token: string | null | undefined): string | null {
  if (!token) return null;
  return ENTRY_BY_KEY.get(token.trim().toLowerCase())?.tesseract ?? null;
}

// Script-based detection. Statistical detectors (franc) routinely misread
// Devanagari OCR output as Magahi / Bhojpuri / Nepali and noisy Latin text as
// Afrikaans / Waray / Lingala, and those codes ended up stored as languages.
// For this corpus the writing system is a far more reliable signal.
const SCRIPT_LANGUAGE: Array<{ pattern: RegExp; language: string }> = [
  { pattern: /[ऀ-ॿ]/g, language: "Hindi" },
  { pattern: /[઀-૿]/g, language: "Gujarati" },
  { pattern: /[ঀ-৿]/g, language: "Bengali" },
  { pattern: /[਀-੿]/g, language: "Punjabi" },
  { pattern: /[଀-୿]/g, language: "Odia" },
  { pattern: /[஀-௿]/g, language: "Tamil" },
  { pattern: /[ఀ-౿]/g, language: "Telugu" },
  { pattern: /[ಀ-೿]/g, language: "Kannada" },
  { pattern: /[ഀ-ൿ]/g, language: "Malayalam" },
  { pattern: /[؀-ۿ]/g, language: "Urdu" },
  { pattern: /[ༀ-࿿]/g, language: "Tibetan" },
  { pattern: /[一-鿿]/g, language: "Chinese" },
];

const LATIN_PATTERN = /[A-Za-zÀ-ɏ]/g;
const MIN_SCRIPT_CHARS = 20;

/** Latin-script languages franc may choose between. Anything else is treated as English. */
export const FRANC_LATIN_CANDIDATES = ["eng", "fra", "deu", "ita", "spa", "por"];

/**
 * Detect the dominant language of a text sample from its writing system.
 * Returns a canonical language name, or null when there is not enough text.
 * `guessLatin` (e.g. franc restricted to FRANC_LATIN_CANDIDATES) refines
 * Latin-script text; without it Latin text is assumed to be English.
 */
export function detectLanguageFromText(
  text: string | null | undefined,
  guessLatin?: (sample: string) => string | null | undefined,
): string | null {
  const sample = (text || "").slice(0, 20000);
  if (!sample.trim()) return null;

  let best: { language: string; count: number } | null = null;
  for (const { pattern, language } of SCRIPT_LANGUAGE) {
    const count = sample.match(pattern)?.length ?? 0;
    if (!best || count > best.count) best = { language, count };
  }
  const latinCount = sample.match(LATIN_PATTERN)?.length ?? 0;

  if (best && best.count >= MIN_SCRIPT_CHARS && best.count >= latinCount) {
    return best.language;
  }
  if (latinCount < MIN_SCRIPT_CHARS) return null;

  const guessed = guessLatin ? canonicalLanguageName(guessLatin(sample) || "") : null;
  return guessed ?? "English";
}
