import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const {
        search = "",
        sortBy = "created_at",
        sortOrder = "desc",
        dateFrom = "",
        dateTo = "",
        important = "",
      } = req.query;

      let query = supabase.from("tags").select("id,name,important,created_at");

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }

      if (dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
      }

      if (important === "true") {
        query = query.eq("important", true);
      } else if (important === "false") {
        query = query.eq("important", false);
      } else if (important === "null") {
        query = query.is("important", null);
      }

      const ascending = sortOrder === "asc";
      query = query.order(sortBy as string, { ascending });

      const { data: tags, error } = await query;

      if (error) {
        throw error;
      }

      const csvHeader = "id,name,important,created_at\n";
      const csvRows = (tags || [])
        .map((tag) => {
          const importantValue = tag.important === true ? "true" : tag.important === false ? "false" : "";
          const createdAt = tag.created_at || "";

          const escapeCsvField = (field: string) => {
            if (field.includes(",") || field.includes('"') || field.includes("\n")) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          };

          return [tag.id, escapeCsvField(tag.name || ""), importantValue, createdAt].join(",");
        })
        .join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=tags-export-${new Date().toISOString().split("T")[0]}.csv`,
      );

      return res.status(200).send(csvContent);
    } catch (error) {
      console.error("Error exporting tags:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
