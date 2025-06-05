import formidable, { File } from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
    api: {
        bodyParser: false,
    },
};

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const form = formidable({ multiples: true });
    try {
        const [fields, files] = await new Promise<[Record<string, string | string[]>, Record<string, File | File[]>]>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else {
                    const filteredFields = Object.fromEntries(
                        Object.entries(fields).map(([key, value]) => [key, value || ''])
                    );
                    const filteredFiles = Object.fromEntries(
                        Object.entries(files).filter(([_, value]) => value !== undefined)
                    ) as Record<string, File | File[]>;
                    resolve([filteredFields, filteredFiles]);
                }
            });
        });

        const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf;
        if (!pdfFile || !pdfFile.filepath) {
            return res.status(400).json({ error: 'No valid PDF file uploaded' });
        }

        const fileBuffer = fs.readFileSync(pdfFile.filepath);
        const fileName = `pdf-${Date.now()}.pdf`;

        const { error: uploadError } = await supabase.storage
            .from('pdfs')
            .upload(fileName, fileBuffer, { contentType: 'application/pdf' });

        if (uploadError) {
            return res.status(500).json({ error: 'Error uploading file', details: uploadError.message });
        }

        const { data: publicUrlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
        const pdfUrl = publicUrlData?.publicUrl;
        if (!pdfUrl) {
            return res.status(500).json({ error: 'Error generating public URL' });
        }

        const name = fields.name as string;
        const summary = fields.summary as string;
        const volume = fields.volume as string;
        const number = fields.number as string;
        const title_name = fields.title_name as string;
        const page_numbers = fields.page_numbers as string;
        const authors = fields.authors as string;
        const language = fields.language as string;
        const timestamp = fields.timestamp as string;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const { data: record, error: insertError } = await supabase
            .from('records')
            .insert([{
                name,
                summary,
                pdf_url: pdfUrl,
                volume,
                number,
                title_name,
                page_numbers,
                authors,
                language,
                timestamp
            }])
            .select();

        if (insertError || !record || record.length === 0) {
            return res.status(500).json({ error: 'Error inserting record', details: insertError?.message });
        }

        return res.status(200).json({ id: record[0].id });
    } catch (error) {
        return res.status(500).json({ error: 'Server error', details: (error as Error).message });
    }
}