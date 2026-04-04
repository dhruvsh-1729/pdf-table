import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: "Name and email are required",
      success: false,
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      error: "Please provide a valid email address",
      success: false,
    });
  }

  const formattedName = `["${name}"]`;
  const formattedEmail = `["${email}"]`;

  try {
    const { data: existingUser, error: checkError } = await supabase
      .from("users")
      .select("id, confirmed")
      .eq("name", formattedName)
      .eq("email", formattedEmail)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    if (existingUser) {
      if (existingUser.confirmed) {
        return res.status(409).json({
          error: "An account with this name and email already exists and is active. Please try logging in instead.",
          success: false,
        });
      }
      return res.status(409).json({
        error: "An account with this name and email is already pending approval. Please wait for admin confirmation.",
        success: false,
      });
    }

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        name: formattedName,
        email: formattedEmail,
        confirmed: false,
      })
      .select("id, name, email, confirmed")
      .single();

    if (insertError) {
      console.error("Error creating user:", insertError);
      return res.status(500).json({
        error: "Failed to create account. Please try again later.",
        success: false,
      });
    }

    return res.status(201).json({
      message: "Account created successfully. Your request is pending admin approval.",
      user: {
        name: newUser.name,
        email: newUser.email,
        confirmed: newUser.confirmed,
      },
      success: true,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      error: "An unexpected error occurred. Please try again later.",
      success: false,
    });
  }
}
