// utils/fuzzyFilter.ts
import { FilterFn } from "@tanstack/react-table";
import { rankItem } from "@tanstack/match-sorter-utils";
import { MagazineRecord } from "../types";

export const fuzzyFilter: FilterFn<MagazineRecord> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};
