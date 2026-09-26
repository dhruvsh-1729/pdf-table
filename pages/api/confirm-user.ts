import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSuperAdmin, wrapField } from "@/lib/auth/server";

// Legacy approval action from the dashboard. Confirming alone no longer grants
// access — a password must also be set in the admin panel (/admin).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireSuperAdmin(req, res))) return;

  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ confirmed: true })
    .eq("name", wrapField(String(name).trim()))
    .eq("email", wrapField(String(email).trim().toLowerCase()));

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ message: "User confirmed. Set a password in the admin panel to grant access." });
}
