import { normalizeAuthorIds } from "@/lib/magazineUtils";

type AuthorExistenceResult = {
  validIds: number[];
  missingIds: number[];
};

export async function assertAuthorsExist(supabase: any, authorIds: number[]): Promise<AuthorExistenceResult> {
  const normalized = normalizeAuthorIds(authorIds);
  if (!normalized.length) return { validIds: [], missingIds: [] };

  const { data, error } = await supabase.from("authors").select("id").in("id", normalized);
  if (error) throw error;

  const validIds = (data || []).map((row: any) => Number(row.id)).filter((id: number) => Number.isInteger(id));
  const validSet = new Set(validIds);
  const missingIds = normalized.filter((id) => !validSet.has(id));
  return { validIds, missingIds };
}

export async function replaceMagazineAuthors(supabase: any, magazineId: number, authorIds: number[]) {
  const { validIds, missingIds }: AuthorExistenceResult = await assertAuthorsExist(supabase, authorIds);
  if (missingIds.length) {
    const error: any = new Error("Some authors do not exist.");
    error.code = "AUTHOR_NOT_FOUND";
    error.missingIds = missingIds;
    throw error;
  }

  const { error: deleteError } = await supabase.from("magazine_authors").delete().eq("magazine_id", magazineId);
  if (deleteError) throw deleteError;

  if (!validIds.length) return;

  const { error: insertError } = await supabase.from("magazine_authors").upsert(
    validIds.map((authorId: number) => ({ magazine_id: magazineId, author_id: authorId })),
    { onConflict: "magazine_id,author_id", ignoreDuplicates: true },
  );
  if (insertError) throw insertError;
}

export async function addMagazineAuthors(supabase: any, magazineId: number, authorIds: number[]) {
  const { validIds, missingIds }: AuthorExistenceResult = await assertAuthorsExist(supabase, authorIds);
  if (missingIds.length) {
    const error: any = new Error("Some authors do not exist.");
    error.code = "AUTHOR_NOT_FOUND";
    error.missingIds = missingIds;
    throw error;
  }

  if (!validIds.length) return;

  const { error } = await supabase.from("magazine_authors").upsert(
    validIds.map((authorId: number) => ({ magazine_id: magazineId, author_id: authorId })),
    { onConflict: "magazine_id,author_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function removeMagazineAuthors(supabase: any, magazineId: number, authorIds: number[]) {
  const normalized = normalizeAuthorIds(authorIds);
  if (!normalized.length) return;

  const { error } = await supabase
    .from("magazine_authors")
    .delete()
    .eq("magazine_id", magazineId)
    .in("author_id", normalized);
  if (error) throw error;
}
