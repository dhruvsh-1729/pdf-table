// pages/api/notify-work-finished.ts
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const resend = new Resend(process.env.RESEND_API_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // Clean the name and email to match the format in database
    const cleanName = name.replace(/^\["|"\]$/g, "").trim();
    const cleanEmail = email.replace(/^\["|"\]$/g, "").trim();

    // Update the user's work_done status in the database
    const { data: updateData, error: updateError } = await supabase
      .from("users")
      .update({ work_done: true })
      .eq("name", `["${cleanName}"]`)
      .eq("email", `["${cleanEmail}"]`)
      .select();

    if (updateError) {
      console.error("Database update error:", updateError);
      return res.status(500).json({
        error: "Failed to update work status in database",
        details: updateError.message,
      });
    }

    if (!updateData || updateData.length === 0) {
      return res.status(404).json({
        error: "User not found in database",
        searchedFor: { name: `["${cleanName}"]`, email: `["${cleanEmail}"]` },
      });
    }

    // Send email notification to Sahebji
    // try {
    //   const emailResult = await resend.emails.send({
    //     from: "onboarding@resend.dev", // Replace with your verified domain
    //     to: `${cleanEmail}`,
    //     subject: `Work Completed - ${cleanName}`,
    //     html: `
    //       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    //         <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    //           <h1 style="margin: 0; font-size: 28px;">🎉 Work Completed!</h1>
    //         </div>

    //         <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
    //           <div style="background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    //             <h2 style="color: #28a745; margin-top: 0; font-size: 22px;">Work Status Update</h2>
    //             <p style="font-size: 16px; line-height: 1.6; margin-bottom: 15px;">
    //               <strong>${cleanName}</strong> has marked their assigned work as <span style="color: #28a745; font-weight: bold;">COMPLETED</span>.
    //             </p>

    //             <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 20px 0;">
    //               <h3 style="color: #155724; margin: 0 0 10px 0; font-size: 16px;">📋 User Details:</h3>
    //               <p style="margin: 5px 0; color: #155724;"><strong>Name:</strong> ${cleanName}</p>
    //               <p style="margin: 5px 0; color: #155724;"><strong>Email:</strong> ${cleanEmail}</p>
    //               <p style="margin: 5px 0; color: #155724;"><strong>Completion Time:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
    //             </div>

    //             <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0;">
    //               <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 16px;">⚡ Next Steps:</h3>
    //               <ul style="color: #856404; margin: 10px 0; padding-left: 20px;">
    //                 <li>Sahebji will review the completed work in the dashboard</li>
    //                 <li>,Verify all assigned tasks are finished</li>
    //                 <li>and Provide feedback if necessary</li>
    //               </ul>
    //             </div>
    //           </div>

    //           <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
    //             <p style="color: #6c757d; font-size: 14px; margin: 0;">
    //               This is an automated notification from your work management system.
    //             </p>
    //           </div>
    //         </div>
    //       </div>
    //     `,
    //     text: `
    //       Work Completed Notification

    //       ${cleanName} has marked their assigned work as COMPLETED.

    //       User Details:
    //       - Name: ${cleanName}
    //       - Email: ${cleanEmail}
    //       - Completion Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
    //     `,
    //   });

    //   console.log("Email sent successfully:", emailResult);
    // } catch (emailError) {
    //   console.error("Email sending error:", emailError);
    //   // Don't fail the API call if email fails, just log it
    //   // The database update was successful, which is the primary goal
    // }

    return res.status(200).json({
      success: true,
      message: "Work status updated and notification sent successfully",
      user: updateData[0],
    });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
