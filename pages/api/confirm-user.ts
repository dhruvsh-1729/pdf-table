import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  // Format name and email if needed
  const formattedName = name.trim();
  const formattedEmail = email.trim().toLowerCase();

  const { error } = await supabaseAdmin
    .from("users")
    .update({ confirmed: true })
    .eq("name", formattedName)
    .eq("email", formattedEmail);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ message: "User confirmed successfully" });
}
