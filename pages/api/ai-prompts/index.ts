import type { NextApiRequest, NextApiResponse } from "next";
import { listAiPrompts } from "@/lib/aiPromptStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const prompts = await listAiPrompts();
    return res.status(200).json({ prompts });
  } catch (error) {
    console.error("Error fetching AI prompts:", error);
    return res.status(500).json({ error: "Failed to fetch AI prompts." });
  }
}
