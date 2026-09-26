// ops/pipeline/publish.mjs — upload one article PDF and write the record with all relations in one transaction.
// If the database transaction fails, the uploaded file is deleted again.
import { UTApi, UTFile } from "uploadthing/server";
import { sql } from "./sql.mjs";

let utapi = null;
const ut = () => (utapi ??= new UTApi({ apiKey: process.env.UPLOADTHING_TOKEN }));

export async function uploadPdf(buffer, filename) {
  const file = new UTFile([buffer], filename, { type: "application/pdf" });
  const res = await ut().uploadFiles(file, { contentDisposition: "inline" });
  const data = Array.isArray(res) ? res[0]?.data : res?.data;
  const error = Array.isArray(res) ? res[0]?.error : res?.error;
  if (error || !data?.key) throw new Error(`UploadThing upload failed: ${error?.message ?? "no key"}`);
  return { key: data.key, url: data.ufsUrl ?? data.url };
}

export async function deletePdf(key) {
  await ut().deleteFiles([key]).catch(() => undefined);
}

/** Existing record for the same piece of the same issue (idempotency). */
export async function findExisting({ magazineId, volume, number, title }) {
  const rows = await sql()`
    SELECT id FROM public.records
    WHERE magazine_id = ${magazineId}
      AND coalesce(volume, '') = ${volume ?? ""} AND coalesce(number, '') = ${number ?? ""}
      AND public.entity_name_key(coalesce(title_name, '')) = public.entity_name_key(${title})
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

/**
 * rec: { magazineId, magazineName, issueDate, volume, number, pageNumbers, title, authors[], languages[], summary, conclusion,
 *        text, textQuality, textSource, recordType, publicationYear, publicationMonth, checkStatus, audit{score,notes,model},
 *        subsubjectIds[] }
 */
export async function publishRecord(rec, pdfBuffer, filename) {
  const upload = await uploadPdf(pdfBuffer, filename);
  try {
    return await sql().begin(async (tx) => {
      const [row] = await tx`
        INSERT INTO public.records (
          name_legacy, magazine_id, timestamp, volume, number, page_numbers, title_name, authors, language_legacy,
          summary, conclusion, extracted_text, pdf_url, pdf_public_id, creator_name,
          publication_year, publication_month, record_type, text_quality, text_source,
          summary_origin, check_status, audit_score, audit_notes, audit_model, audited_at)
        VALUES (
          ${rec.magazineName}, ${rec.magazineId}, ${rec.issueDate}, ${rec.volume}, ${rec.number}, ${rec.pageNumbers}, ${rec.title},
          ${rec.authors.join(", ") || null}, ${rec.languages.join(", ") || null},
          ${rec.summary}, ${rec.conclusion}, ${rec.text}, ${upload.url}, ${upload.key}, 'ingest-pipeline',
          ${rec.publicationYear}, ${rec.publicationMonth}, ${rec.recordType}, ${rec.textQuality}, ${rec.textSource},
          'ai', ${rec.checkStatus}, ${rec.audit?.score ?? null}, ${rec.audit?.notes ?? null}, ${rec.audit?.model ?? null}, now())
        RETURNING id`;
      const id = row.id;

      for (const name of rec.authors) {
        await tx`INSERT INTO public.authors (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
        const [a] = await tx`SELECT id FROM public.authors WHERE public.entity_name_key(name) = public.entity_name_key(${name}) LIMIT 1`;
        if (a) await tx`INSERT INTO public.record_authors (record_id, author_id) VALUES (${id}, ${a.id}) ON CONFLICT DO NOTHING`;
      }
      for (const lang of rec.languages) {
        const [l] = await tx`SELECT id FROM public.languages WHERE lower(name) = lower(${lang}) LIMIT 1`;
        if (l) await tx`INSERT INTO public.record_languages (record_id, language_id) VALUES (${id}, ${l.id}) ON CONFLICT DO NOTHING`;
      }
      for (const sid of rec.subsubjectIds) {
        await tx`INSERT INTO public.record_subsubjects (record_id, subsubject_id) VALUES (${id}, ${sid}) ON CONFLICT DO NOTHING`;
        await tx`
          INSERT INTO public.record_subjects (record_id, subject_id)
          SELECT ${id}, subject_id FROM public.subsubjects WHERE id = ${sid}
          ON CONFLICT DO NOTHING`;
      }
      return { id, pdfUrl: upload.url };
    });
  } catch (err) {
    await deletePdf(upload.key);
    throw err;
  }
}

