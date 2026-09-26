import { cleanEntityName, findByEntityName } from "@/lib/entityNames";

describe("cleanEntityName", () => {
  it("trims, collapses whitespace and NFC-normalises", () => {
    expect(cleanEntityName("  आचार्यश्री   महाप्रज्ञ ")).toBe("आचार्यश्री महाप्रज्ञ");
    expect(cleanEntityName("Karma\tand  Rebirth")).toBe("Karma and Rebirth");
    expect(cleanEntityName("Café")).toBe("Café");
    expect(cleanEntityName(undefined)).toBe("");
  });
});

describe("findByEntityName", () => {
  function fakeSupabase(rows: any[]) {
    const calls: any[] = [];
    const builder: any = {
      select: () => builder,
      ilike: (col: string, value: string) => {
        calls.push([col, value]);
        return builder;
      },
      limit: async () => ({ data: rows, error: null }),
    };
    return { client: { from: () => builder }, calls };
  }

  it("matches the cleaned name exactly, escaping LIKE wildcards", async () => {
    const { client, calls } = fakeSupabase([{ id: 7, name: "100% Jain_Studies" }]);
    const found = await findByEntityName(client, "tags", " 100%  Jain_Studies ");
    expect(found).toEqual({ id: 7, name: "100% Jain_Studies" });
    expect(calls).toEqual([["name", "100\\% Jain\\_Studies"]]);
  });

  it("returns null for blank names without querying", async () => {
    const { client, calls } = fakeSupabase([]);
    expect(await findByEntityName(client, "authors", "   ")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
