import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === 'GET') {
    const { recordId } = req.query;
    if (!recordId) return res.status(400).json({ error: 'Record ID is required' });

    try {
      const { data, error } = await supabase
        .from('record_tags')
        .select('tags(id, name)')
        .eq('record_id', recordId);

      if (error) throw error;
      const tags = data.map(item => item.tags);
      return res.status(200).json(tags);
    } catch (error) {
      return res.status(500).json({ error: 'Error fetching record tags', details: (error as Error).message });
    }
  } else if (req.method === 'POST') {
    const { recordId, tagIds } = req.body;
    if (!recordId || !Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'Record ID and tag IDs array are required' });
    }

    try {
      const { error } = await supabase
        .from('record_tags')
        .insert(tagIds.map(tagId => ({ record_id: recordId, tag_id: tagId })));

      if (error) throw error;
      return res.status(200).json({ message: 'Tags assigned successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'Error assigning tags', details: (error as Error).message });
    }
  } else if (req.method === 'DELETE') {
    const { recordId, tagIds } = req.body;
    if (!recordId || !Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'Record ID and tag IDs array are required' });
    }

    try {
      const { error } = await supabase
        .from('record_tags')
        .delete()
        .eq('record_id', recordId)
        .in('tag_id', tagIds);

      if (error) throw error;
      return res.status(200).json({ message: 'Tags removed successfully' });
    } catch (error) {
      return res.status(500).json({ error: 'Error removing tags', details: (error as Error).message });
    }
  } else {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
}