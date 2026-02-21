import {
  normalizeAuthorIds,
  normalizeEmail,
  normalizeFoundedYear,
  normalizeImageUrl,
  normalizeMagazinePayload,
  normalizeMetadata,
  normalizeSlug,
  normalizeWebsiteUrl,
} from "@/lib/magazineUtils";

describe("magazineUtils", () => {
  describe("normalizeSlug", () => {
    it("normalizes free text slugs and uses fallback name", () => {
      expect(normalizeSlug("My Journal 2026!")).toBe("my-journal-2026");
      expect(normalizeSlug(undefined, "Space & Society")).toBe("space-society");
      expect(normalizeSlug("###")).toBe("magazine");
    });
  });

  describe("URL normalization", () => {
    it("normalizes website URLs and auto-prefixes scheme", () => {
      expect(normalizeWebsiteUrl("example.com")).toBe("https://example.com/");
      expect(normalizeWebsiteUrl("https://example.com/path?a=1")).toBe("https://example.com/path?a=1");
      expect(normalizeWebsiteUrl("ftp://example.com")).toBeNull();
      expect(normalizeWebsiteUrl("not a url")).toBeNull();
    });

    it("accepts only http(s) image URLs", () => {
      expect(normalizeImageUrl("https://cdn.example.com/logo.png")).toBe("https://cdn.example.com/logo.png");
      expect(normalizeImageUrl("http://cdn.example.com/logo.png")).toBe("http://cdn.example.com/logo.png");
      expect(normalizeImageUrl("data:image/png;base64,abc")).toBeNull();
      expect(normalizeImageUrl("")).toBeNull();
    });
  });

  describe("primitive normalizers", () => {
    it("validates and lowercases contact emails", () => {
      expect(normalizeEmail(" Editor@Example.ORG ")).toBe("editor@example.org");
      expect(normalizeEmail("invalid-email")).toBeNull();
    });

    it("validates founded year boundaries", () => {
      const nextYear = new Date().getFullYear() + 1;
      expect(normalizeFoundedYear(1998)).toBe(1998);
      expect(normalizeFoundedYear(String(nextYear))).toBe(nextYear);
      expect(normalizeFoundedYear(1499)).toBeNull();
      expect(normalizeFoundedYear(nextYear + 1)).toBeNull();
      expect(normalizeFoundedYear("2024.5")).toBeNull();
    });

    it("normalizes metadata from object or JSON string", () => {
      expect(normalizeMetadata({ tier: "A" })).toEqual({ tier: "A" });
      expect(normalizeMetadata('{"impact_factor": 3.2}')).toEqual({ impact_factor: 3.2 });
      expect(normalizeMetadata("[1,2,3]")).toEqual({});
      expect(normalizeMetadata("bad json")).toEqual({});
    });

    it("normalizes and deduplicates author ids", () => {
      expect(normalizeAuthorIds([1, "2", 2, 0, -1, 3.5, "x"])).toEqual([1, 2]);
      expect(normalizeAuthorIds(null)).toEqual([]);
    });
  });

  describe("normalizeMagazinePayload", () => {
    it("enforces required name on create", () => {
      const { errors } = normalizeMagazinePayload({}, { isUpdate: false });
      expect(errors).toContain("Name is required.");
    });

    it("rejects empty name on update", () => {
      const { errors } = normalizeMagazinePayload({ name: "  " }, { isUpdate: true });
      expect(errors).toContain("Name cannot be empty.");
    });

    it("normalizes a valid create payload with authors", () => {
      const { data, authorIds, errors } = normalizeMagazinePayload(
        {
          name: "Journal of Ethics",
          short_name: "JoE",
          website_url: "journal.example.org",
          contact_email: "EDITOR@EXAMPLE.ORG",
          founded_year: "2005",
          metadata: '{"publisher":"Acme"}',
          is_active: "false",
          author_ids: [4, "5", 5, -1],
        },
        { isUpdate: false },
      );

      expect(errors).toEqual([]);
      expect(data.name).toBe("Journal of Ethics");
      expect(data.slug).toBe("journal-of-ethics");
      expect(data.website_url).toBe("https://journal.example.org/");
      expect(data.contact_email).toBe("editor@example.org");
      expect(data.founded_year).toBe(2005);
      expect(data.metadata).toEqual({ publisher: "Acme" });
      expect(data.is_active).toBe(false);
      expect(authorIds).toEqual([4, 5]);
    });

    it("collects validation errors for invalid fields", () => {
      const { errors } = normalizeMagazinePayload(
        {
          name: "Valid Name",
          website_url: "http://",
          cover_image_url: "file://cover.png",
          logo_image_url: "data:image/png;base64,abc",
          contact_email: "bad email",
          founded_year: 1200,
        },
        { isUpdate: false },
      );

      expect(errors).toEqual(
        expect.arrayContaining([
          "Invalid website URL.",
          "Invalid cover image URL.",
          "Invalid logo image URL.",
          "Invalid contact email.",
          "Invalid founded year.",
        ]),
      );
    });
  });
});
