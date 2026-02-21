import { addMagazineAuthors, assertAuthorsExist, removeMagazineAuthors, replaceMagazineAuthors } from "@/lib/magazineAuthorUtils";

function buildSupabaseMock(existingAuthorIds: number[]) {
  const calls = {
    deleteMagazineAuthors: [] as Array<{ magazineId: number }>,
    removeMagazineAuthors: [] as Array<{ magazineId: number; authorIds: number[] }>,
    upserts: [] as any[],
  };

  const supabase = {
    from: (table: string) => {
      if (table === "authors") {
        return {
          select: () => ({
            in: async (_column: string, ids: number[]) => ({
              data: ids.filter((id) => existingAuthorIds.includes(id)).map((id) => ({ id })),
              error: null,
            }),
          }),
        };
      }

      if (table === "magazine_authors") {
        return {
          delete: () => ({
            eq: (column: string, magazineId: number) => {
              if (column !== "magazine_id") {
                throw new Error(`Unexpected column ${column}`);
              }

              const deleteOnlyPromise: Promise<{ error: null }> = Promise.resolve().then(() => {
                calls.deleteMagazineAuthors.push({ magazineId });
                return { error: null };
              });

              return Object.assign(deleteOnlyPromise, {
                in: async (authorColumn: string, authorIds: number[]) => {
                  if (authorColumn !== "author_id") {
                    throw new Error(`Unexpected author column ${authorColumn}`);
                  }
                  calls.removeMagazineAuthors.push({ magazineId, authorIds });
                  return { error: null };
                },
              });
            },
          }),
          upsert: async (rows: any[], options: unknown) => {
            calls.upserts.push({ rows, options });
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, calls };
}

describe("magazineAuthorUtils", () => {
  it("assertAuthorsExist returns valid and missing ids", async () => {
    const { supabase } = buildSupabaseMock([1, 3, 5]);
    const result = await assertAuthorsExist(supabase, [1, 2, 3, 3, -1]);
    expect(result.validIds.sort()).toEqual([1, 3]);
    expect(result.missingIds).toEqual([2]);
  });

  it("replaceMagazineAuthors throws AUTHOR_NOT_FOUND if any author is missing", async () => {
    const { supabase, calls } = buildSupabaseMock([1]);

    await expect(replaceMagazineAuthors(supabase, 10, [1, 2])).rejects.toMatchObject({
      code: "AUTHOR_NOT_FOUND",
      missingIds: [2],
    });
    expect(calls.deleteMagazineAuthors).toEqual([]);
    expect(calls.upserts).toEqual([]);
  });

  it("replaceMagazineAuthors clears old mappings and upserts normalized ids", async () => {
    const { supabase, calls } = buildSupabaseMock([1, 2, 3]);
    await replaceMagazineAuthors(supabase, 11, [1, 1, "2" as any, 3]);

    expect(calls.deleteMagazineAuthors).toEqual([{ magazineId: 11 }]);
    expect(calls.upserts).toHaveLength(1);
    expect(calls.upserts[0].rows).toEqual([
      { magazine_id: 11, author_id: 1 },
      { magazine_id: 11, author_id: 2 },
      { magazine_id: 11, author_id: 3 },
    ]);
  });

  it("addMagazineAuthors upserts and does not clear existing rows", async () => {
    const { supabase, calls } = buildSupabaseMock([4, 5]);
    await addMagazineAuthors(supabase, 20, [4, 5]);

    expect(calls.deleteMagazineAuthors).toEqual([]);
    expect(calls.upserts).toHaveLength(1);
    expect(calls.upserts[0].rows).toEqual([
      { magazine_id: 20, author_id: 4 },
      { magazine_id: 20, author_id: 5 },
    ]);
  });

  it("removeMagazineAuthors deletes only requested ids", async () => {
    const { supabase, calls } = buildSupabaseMock([]);
    await removeMagazineAuthors(supabase, 30, [1, 2, 2, -1]);
    expect(calls.removeMagazineAuthors).toEqual([{ magazineId: 30, authorIds: [1, 2] }]);
  });
});
