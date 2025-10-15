// types.ts
export interface EditHistory {
  count: number;
  editors: string[];
  editorCounts: Record<string, number>;
  latestEditor: {
    name: string;
    email: string;
    editedAt: string;
    timeFromNow: string;
  } | null;
}

export interface Tag {
  id: number;
  name: string;
}

export interface MagazineRecord {
  id: number;
  name: string;
  timestamp: string | null;
  summary: string | null;
  pdf_public_id: string | null;
  pdf_url: string;
  volume: string | null;
  number: string | null;
  title_name: string | null;
  page_numbers: string | null;
  authors: string | null;
  language: string | null;
  email: string | null;
  creator_name: string | null;
  conclusion: string | null;
  editHistory?: EditHistory;
  tags?: Tag[];
  authors_linked?: Tag[];
}

export interface User {
  name: string;
  email: string;
  access: string;
}
