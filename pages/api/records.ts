import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { email } = req.query;
        console.log({ email }); // Log the email parameter for debugging

        // Build the query based on the presence of the email parameter
        let query = supabase.from('records').select('*');
        if (email && typeof email === 'string' && email.trim() !== '') {
            query = query.eq('email', '["' + email + '"]'); // Ensure email is formatted as a string
        }

        const { data: records, error } = await query;
        if (error) {
            console.error('Supabase error:', error.message);
            return res.status(500).json({ error: 'Error fetching records', details: error.message });
        }

        // Ensure all fields are properly formatted as strings, flattening arrays with single string elements
        const processedRecords = records?.map(record => {
            const formattedRecord: Record<string, any> = {};
            for (const key in record) {
                let value = record[key];
                if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
                    value = value[0];
                }
                if (typeof value !== 'string') {
                    value = value === null || value === undefined ? '' : String(value);
                }
                // Remove surrounding [" and "] from string fields
                if (typeof value === 'string' && value.startsWith('["') && value.endsWith('"]')) {
                    value = value.slice(2, -2);
                }
                formattedRecord[key] = value;
            }
            return formattedRecord;
        });

        return res.status(200).json(processedRecords || []);
    } catch (error) {
        console.error('Server error:', (error as Error).message);
        return res.status(500).json({ error: 'Server error', details: (error as Error).message });
    }
}
