import type { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import formidable from 'formidable';
import { promises as fs } from 'fs'; // ✅ fixed here

const resend = new Resend(process.env.RESEND_API_KEY!);

export const config = {
  api: {
    bodyParser: false,
  },
};

const parseForm = (req: NextApiRequest): Promise<{ fields: any; files: any }> => {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true });
    form.parse(req, (err: any, fields: any, files: any) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fields, files } = await parseForm(req);

    const title = fields.title;
    const description = fields.description;
    const images = Array.isArray(files.images) ? files.images : files.images ? [files.images] : [];

    // Prepare attachments for Resend
    const attachments = await Promise.all(
      images.map(async (img: any) => {
        const buffer = await fs.readFile(img.filepath);
        return {
          filename: img.originalFilename,
          content: buffer,
        };
      })
    );

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'dhruvshdarshansh@gmail.com',
      subject: `Bug from magazine summary software (KKMS): ${title}`,
      html: `<h3>${title}</h3><p>${description}</p>`,
      attachments,
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}