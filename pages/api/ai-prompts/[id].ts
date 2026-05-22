import type { NextApiRequest, NextApiResponse } from "next";
import { findMissingRequiredPlaceholders } from "@/lib/aiPromptCatalog";
import { listAiPrompts, updateAiPrompt } from "@/lib/aiPromptStore";

function parseId(idValue: string | string[] | undefined) {
  if (!idValue || Array.isArray(idValue)) return null;
  const id = Number(idValue);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = parseId(req.query.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid prompt id." });
  }

  if (req.method !== "PUT" && req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const prompts = await listAiPrompts();
    const existing = prompts.find((prompt) => prompt.id === id);
    if (!existing) {
      return res.status(404).json({ error: "Prompt not found." });
    }

    const systemPrompt = typeof req.body?.system_prompt === "string" ? req.body.system_prompt.trim() : "";
    const userPromptTemplate = typeof req.body?.user_prompt_template === "string" ? req.body.user_prompt_template.trim() : "";

    if (!systemPrompt || !userPromptTemplate) {
      return res.status(400).json({ error: "Both system_prompt and user_prompt_template are required." });
    }

    const missingPlaceholders = findMissingRequiredPlaceholders(
      userPromptTemplate,
      existing.required_placeholders || [],
    );
    if (missingPlaceholders.length > 0) {
      return res.status(400).json({
        error: `Prompt is missing required placeholders: ${missingPlaceholders.map((value) => `{{${value}}}`).join(", ")}`,
      });
    }

    const prompt = await updateAiPrompt(id, {
      system_prompt: systemPrompt,
      user_prompt_template: userPromptTemplate,
    });

    return res.status(200).json({ prompt });
  } catch (error) {
    console.error("Error updating AI prompt:", error);
    return res.status(500).json({ error: "Failed to update AI prompt." });
  }
}
