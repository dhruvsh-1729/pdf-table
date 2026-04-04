import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  const formattedName = `["${name}"]`;
  const formattedEmail = `["${email}"]`;

  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, confirmed")
    .eq("name", formattedName)
    .eq("email", formattedEmail)
    .eq("confirmed", true)
    .single();

  if (error || !data) {
    return res.status(401).json({ error: "Invalid credentials", user: null, success: false });
  }

  return res.status(200).json({ message: "Login successful", user: data, success: true });
}
