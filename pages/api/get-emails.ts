import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Query distinct creator_name and email rows from the "records" table
        const { data, error } = await supabase
            .from('records')
            .select('creator_name, email')
            .neq('creator_name', null)
            .neq('email', null)
            .then((response) => {
            if (response.error) throw response.error;
            const uniqueData = Array.from(
                new Map(response.data.map((item: any) => [item.email, item])).values()
            ).map((item: any) => ({
                creator_name: item.creator_name.replace(/^\[|\]$/g, '').replace(/^"|"$/g, ''),
                email: item.email.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '')
            }));
            return { data: uniqueData, error: null };
            });

        if (error) {
            throw error;
        }

        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}