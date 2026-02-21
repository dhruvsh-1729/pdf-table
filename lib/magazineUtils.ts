export type MagazineInput = {
  name?: unknown;
  short_name?: unknown;
  slug?: unknown;
  description?: unknown;
  cover_image_url?: unknown;
  cover_image_public_id?: unknown;
  logo_image_url?: unknown;
  logo_image_public_id?: unknown;
  website_url?: unknown;
  contact_email?: unknown;
  headquarters?: unknown;
  founded_year?: unknown;
  issn_print?: unknown;
  issn_online?: unknown;
  is_active?: unknown;
  metadata?: unknown;
  author_ids?: unknown;
};

export type NormalizedMagazinePayload = {
  name?: string;
  short_name?: string | null;
  slug?: string;
  description?: string | null;
  cover_image_url?: string | null;
  cover_image_public_id?: string | null;
  logo_image_url?: string | null;
  logo_image_public_id?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  headquarters?: string | null;
  founded_year?: number | null;
  issn_print?: string | null;
  issn_online?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function toNullOrTrimmed(value: unknown, maxLength = 2048): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function normalizeSlug(value: unknown, fallbackName?: string | null): string {
  const source = toNullOrTrimmed(value, 160) || toNullOrTrimmed(fallbackName, 160) || "";
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "magazine";
}

export function normalizeWebsiteUrl(value: unknown): string | null {
  const raw = toNullOrTrimmed(value);
  if (!raw) return null;

  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeImageUrl(value: unknown): string | null {
  const raw = toNullOrTrimmed(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeEmail(value: unknown): string | null {
  const raw = toNullOrTrimmed(value, 320);
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  return EMAIL_RE.test(lowered) ? lowered : null;
}

export function normalizeFoundedYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  const max = new Date().getFullYear() + 1;
  if (num < 1500 || num > max) return null;
  return num;
}

export function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function normalizeAuthorIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
  return Array.from(new Set(normalized));
}

export function normalizeMagazinePayload(
  input: MagazineInput,
  { isUpdate = false }: { isUpdate?: boolean } = {},
): { data: NormalizedMagazinePayload; authorIds: number[]; errors: string[] } {
  const errors: string[] = [];
  const name = toNullOrTrimmed(input.name, 200);

  if (!isUpdate && !name) {
    errors.push("Name is required.");
  }

  if (isUpdate && input.name !== undefined && !name) {
    errors.push("Name cannot be empty.");
  }

  const websiteUrl = input.website_url !== undefined ? normalizeWebsiteUrl(input.website_url) : undefined;
  if (input.website_url !== undefined && input.website_url !== null && String(input.website_url).trim() && !websiteUrl) {
    errors.push("Invalid website URL.");
  }

  const coverImageUrl =
    input.cover_image_url !== undefined ? normalizeImageUrl(input.cover_image_url) : undefined;
  if (
    input.cover_image_url !== undefined &&
    input.cover_image_url !== null &&
    String(input.cover_image_url).trim() &&
    !coverImageUrl
  ) {
    errors.push("Invalid cover image URL.");
  }

  const logoImageUrl = input.logo_image_url !== undefined ? normalizeImageUrl(input.logo_image_url) : undefined;
  if (
    input.logo_image_url !== undefined &&
    input.logo_image_url !== null &&
    String(input.logo_image_url).trim() &&
    !logoImageUrl
  ) {
    errors.push("Invalid logo image URL.");
  }

  const contactEmail = input.contact_email !== undefined ? normalizeEmail(input.contact_email) : undefined;
  if (input.contact_email !== undefined && input.contact_email !== null && String(input.contact_email).trim() && !contactEmail) {
    errors.push("Invalid contact email.");
  }

  const foundedYear = input.founded_year !== undefined ? normalizeFoundedYear(input.founded_year) : undefined;
  if (input.founded_year !== undefined && input.founded_year !== null && input.founded_year !== "" && foundedYear === null) {
    errors.push("Invalid founded year.");
  }

  const shortName = input.short_name !== undefined ? toNullOrTrimmed(input.short_name, 120) : undefined;
  const description = input.description !== undefined ? toNullOrTrimmed(input.description, 5000) : undefined;
  const coverImagePublicId =
    input.cover_image_public_id !== undefined ? toNullOrTrimmed(input.cover_image_public_id, 512) : undefined;
  const logoImagePublicId =
    input.logo_image_public_id !== undefined ? toNullOrTrimmed(input.logo_image_public_id, 512) : undefined;
  const headquarters = input.headquarters !== undefined ? toNullOrTrimmed(input.headquarters, 180) : undefined;
  const issnPrint = input.issn_print !== undefined ? toNullOrTrimmed(input.issn_print, 20) : undefined;
  const issnOnline = input.issn_online !== undefined ? toNullOrTrimmed(input.issn_online, 20) : undefined;

  const isActive =
    input.is_active !== undefined
      ? input.is_active === true || input.is_active === "true" || input.is_active === 1 || input.is_active === "1"
      : undefined;

  const metadata = input.metadata !== undefined ? normalizeMetadata(input.metadata) : undefined;

  const data: NormalizedMagazinePayload = {
    ...(name !== undefined ? { name: name || undefined } : {}),
    ...(shortName !== undefined ? { short_name: shortName } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(coverImageUrl !== undefined ? { cover_image_url: coverImageUrl } : {}),
    ...(coverImagePublicId !== undefined ? { cover_image_public_id: coverImagePublicId } : {}),
    ...(logoImageUrl !== undefined ? { logo_image_url: logoImageUrl } : {}),
    ...(logoImagePublicId !== undefined ? { logo_image_public_id: logoImagePublicId } : {}),
    ...(websiteUrl !== undefined ? { website_url: websiteUrl } : {}),
    ...(contactEmail !== undefined ? { contact_email: contactEmail } : {}),
    ...(headquarters !== undefined ? { headquarters } : {}),
    ...(foundedYear !== undefined ? { founded_year: foundedYear } : {}),
    ...(issnPrint !== undefined ? { issn_print: issnPrint } : {}),
    ...(issnOnline !== undefined ? { issn_online: issnOnline } : {}),
    ...(isActive !== undefined ? { is_active: isActive } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };

  if ((name || input.slug !== undefined) && !("slug" in data)) {
    data.slug = normalizeSlug(input.slug, name);
  }

  const authorIds = normalizeAuthorIds(input.author_ids);
  return { data, authorIds, errors };
}
