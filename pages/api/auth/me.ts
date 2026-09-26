import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser } from "@/lib/auth/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated", user: null });
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ user: { name: user.name, email: user.email, role: user.role } });
}
