import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('email, name');

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            // Format the data to remove any unwanted characters
            const formattedData = data.map((item) => ({
                email: item.email.replace(/^\[|\]$/g, '').replace(/^"|"$/g, ''),
                name: item.name.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '')
            }));

            res.status(200).json(formattedData);
        } catch (err) {
            res.status(500).json({ error: 'Something went wrong' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}