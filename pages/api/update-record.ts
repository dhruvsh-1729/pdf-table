import formidable, { File } from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
    api: { bodyParser: false },
};

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

        const id = fields.id || req.query.id;
        if (!id) return res.status(400).json({ error: 'Missing record ID' });

        // Fetch existing record to get current pdf_url and summary
        const { data: existingRecord, error: fetchError } = await supabase
            .from('records')
            .select('summary, pdf_url')
            .eq('id', id)
            .single();

        if (fetchError) return res.status(500).json({ error: fetchError.message });

        let pdfUrl = existingRecord.pdf_url;

        if (files.pdf) {            
            const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf;
            if (pdfFile && pdfFile.filepath) {
                const fileBuffer = fs.readFileSync(pdfFile.filepath);
                const fileName = `pdf-${Date.now()}.pdf`;

                // Upload new PDF
                const { error: uploadError } = await supabase.storage
                    .from('pdfs')
                    .upload(fileName, fileBuffer, { contentType: 'application/pdf' });

                if (uploadError) {
                    return res.status(500).json({ error: 'Error uploading file', details: uploadError.message });
                }

                const { data: publicUrlData } = supabase.storage.from('pdfs').getPublicUrl(fileName);
                pdfUrl = publicUrlData?.publicUrl;
                if (!pdfUrl) {
                    return res.status(500).json({ error: 'Error generating public URL' });
                }

                // Delete old PDF if a new one was uploaded
                if (existingRecord.pdf_url) {
                    const oldFileName = existingRecord.pdf_url.split('/').pop();
                    if (oldFileName) {
                        const { error: deleteError } = await supabase.storage.from('pdfs').remove([oldFileName]);
                        if (deleteError) {
                            console.error('Error deleting old PDF:', deleteError.message);
                        }
                    }
                }
            }
        }

        const updateFields = {
            name: fields.name,
            summary: fields.summary,
            pdf_url: pdfUrl,
            volume: fields.volume,
            number: fields.number,
            title_name: fields.title_name,
            page_numbers: fields.page_numbers,
            authors: fields.authors,
            language: fields.language,
            timestamp: fields.timestamp,
            conclusion: fields.conclusion,
        };

        // If the new summary is different, insert into summaries table
        if (existingRecord.summary !== fields.summary) {
            const { error: insertError } = await supabase
                .from('summaries')
                .insert({
                    summary: existingRecord.summary,
                    record_id: Array.isArray(id) ? id[0] : id,
                    email: fields.email,
                    name: fields.creator_name,
                });

            if (insertError) return res.status(500).json({ error: insertError.message });
        }

        const { error } = await supabase
            .from('records')
            .update(updateFields)
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });

        res.status(200).json({ id });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
}