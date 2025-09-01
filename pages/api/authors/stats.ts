import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      // Get total authors count
      const { count: totalAuthors, error: authorsError } = await supabase
        .from("authors")
        .select("*", { count: "exact", head: true });

      if (authorsError) {
        throw authorsError;
      }

      // Get authors created in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: recentAuthors, error: recentError } = await supabase
        .from("authors")
        .select("*", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (recentError) {
        throw recentError;
      }

      // Get authors with descriptions
      const { count: authorsWithDescription, error: descError } = await supabase
        .from("authors")
        .select("*", { count: "exact", head: true })
        .not("description", "is", null)
        .neq("description", "");

      if (descError) {
        throw descError;
      }

      // Get authors with cover images
      const { count: authorsWithCover, error: coverError } = await supabase
        .from("authors")
        .select("*", { count: "exact", head: true })
        .not("cover_url", "is", null)
        .neq("cover_url", "");

      if (coverError) {
        throw coverError;
      }

      return res.status(200).json({
        totalAuthors: totalAuthors || 0,
        recentAuthors: recentAuthors || 0,
        authorsWithDescription: authorsWithDescription || 0,
        authorsWithCover: authorsWithCover || 0,
        completionRate: {
          description: totalAuthors ? (((authorsWithDescription || 0) / totalAuthors) * 100).toFixed(1) : "0.0",
          coverImage: totalAuthors ? (((authorsWithCover || 0) / totalAuthors) * 100).toFixed(1) : "0.0",
        },
      });
    } catch (error) {
      console.error("Error fetching author stats:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
