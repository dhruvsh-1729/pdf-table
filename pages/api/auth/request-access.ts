import type { NextApiRequest, NextApiResponse } from "next";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SUPER_ADMIN_NOTIFY_EMAIL,
  clientIp,
  escapeHtml,
  isValidEmail,
  normalizeEmail,
  rateLimited,
  wrapField,
} from "@/lib/auth/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", success: false });
  }

  const name = String(req.body?.name ?? "").trim().replace(/["\[\]]/g, "").slice(0, 120);
  const email = normalizeEmail(req.body?.email).slice(0, 200);
  const message = String(req.body?.message ?? "").trim().slice(0, 1000);

  if (!name) return res.status(400).json({ error: "Please enter your full name.", success: false });
  if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address.", success: false });

  if (rateLimited(`request-access:${clientIp(req)}`, 5, 60 * 60_000)) {
    return res.status(429).json({ error: "Too many requests. Please try again later.", success: false });
  }

  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, confirmed, password_hash")
    .eq("email", wrapField(email))
    .order("id", { ascending: true })
    .limit(1);

  const row = existing?.[0];
  if (row) {
    await supabaseAdmin.from("users").update({ access_requested_at: now }).eq("id", row.id);
  } else {
    const { error } = await supabaseAdmin.from("users").insert({
      name: wrapField(name),
      email: wrapField(email),
      confirmed: false,
      role: "user",
      access_requested_at: now,
    });
    if (error) {
      console.error("[auth] access request insert failed:", error);
      return res.status(500).json({ error: "Could not submit your request. Please try again later.", success: false });
    }
  }

  const status = row?.password_hash ? "existing user (already has a password — likely a reset request)" : "new / pending";
  const host = req.headers.host ? `https://${req.headers.host}` : "";

  try {
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: SUPER_ADMIN_NOTIFY_EMAIL,
      subject: `Portal access request: ${name}`,
      html: `
        <h2>New password / access request</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Status:</strong> ${escapeHtml(status)}</p>
        ${message ? `<p><strong>Message:</strong><br/>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>` : ""}
        <p>Set a password for this user in the <a href="${host}/admin">admin panel</a> to grant access.</p>
      `,
    });
  } catch (err) {
    // The request is still recorded and visible in the admin panel.
    console.error("[auth] failed to send access request email:", err);
  }

  return res.status(200).json({
    success: true,
    message: "Your request has been sent to the admin. You'll be able to log in once a password is set for you.",
  });
}
