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
            query = query.eq('email', '["' + email.trim() + '"]'); // Use the email string directly for filtering
        }

        const { data: records, error } = await query;
        if (error) {
            console.error('Supabase error:', error);
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
                if (typeof value === 'string') {
                    // Try to parse JSON-encoded strings (e.g., '["text"]' or '"text"')
                    let parsed = value;
                    try {
                        parsed = JSON.parse(value);
                        // If parsed is an array with one string, use that string
                        if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
                            parsed = parsed[0];
                        }
                    } catch {
                        // If parsing fails, fallback to manual cleaning
                        parsed = value;
                    }
                    // Now clean up any remaining escape characters
                    if (typeof parsed === 'string') {
                        parsed = parsed
                            .replace(/\\r\\n|\\n|\\r/g, '\n')  // replace all \r\n or \n or \r with actual newlines
                            .replace(/\\"/g, '"')              // unescape double quotes
                            .replace(/\\'/g, "'")              // unescape single quotes
                            .replace(/\\\\/g, '\\')            // unescape backslashes
                            .replace(/^\s+|\s+$/g, '');        // trim whitespace
                        // Remove " from start and end if both exist
                        if (parsed.startsWith('"') && parsed.endsWith('"')) {
                            parsed = parsed.slice(1, -1);
                        }
                    }
                    value = parsed;
                }
                formattedRecord[key] = value;
            }
            return formattedRecord;
        });

        // For each record, fetch edit history from summaries table
        const recordIds = processedRecords?.map(r => r.id) || [];
        let summariesMap: Record<string, {
            count: number;
            editors: string[];
            editorCounts: Record<string, number>;
            latest: { name: string; email: string; editedAt: string } | null;
        }> = {};

        if (recordIds.length > 0) {
            const { data: summaries, error: summariesError } = await supabase
            .from('summaries')
            .select('record_id, email, name, created_at')
            .in('record_id', recordIds);

            // Strip off [" and "] from string fields in summaries
            const cleanSummaries = summaries?.map(summary => {
                const cleaned: any = { ...summary };
                for (const key of ['record_id', 'email', 'name']) {
                    let value = cleaned[key];
                    if (typeof value === 'string') {
                        // Try to parse JSON-encoded strings (e.g., '["text"]' or '"text"')
                        let parsed = value;
                        try {
                            parsed = JSON.parse(value);
                            // If parsed is an array with one string, use that string
                            if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
                                parsed = parsed[0];
                            }
                        } catch {
                            // If parsing fails, fallback to manual cleaning
                            parsed = value;
                        }
                        // Now clean up any remaining escape characters
                        if (typeof parsed === 'string') {
                            parsed = parsed
                                .replace(/\\r\\n|\\n|\\r/g, '\n')  // replace all \r\n or \n or \r with actual newlines
                                .replace(/\\"/g, '"')              // unescape double quotes
                                .replace(/\\'/g, "'")              // unescape single quotes
                                .replace(/\\\\/g, '\\')            // unescape backslashes
                                .replace(/^\s+|\s+$/g, '');        // trim whitespace
                            // Remove " from start and end if both exist
                            if (parsed.startsWith('"') && parsed.endsWith('"')) {
                                parsed = parsed.slice(1, -1);
                            }
                        }
                        value = parsed;
                    }
                    cleaned[key] = value;
                }
                return cleaned;
            }) || [];

            if (summariesError) {
            console.error('Supabase summaries error:', summariesError.message);
            return res.status(500).json({ error: 'Error fetching summaries', details: summariesError.message });
            }

            // Build a map: record_id -> { count, editors, editorCounts, latest }
            summariesMap = cleanSummaries?.reduce((acc, summary) => {
            const rid = summary.record_id;
            if (!acc[rid]) {
                acc[rid] = {
                count: 0,
                editors: [],
                editorCounts: {},
                latest: null
                };
            }
            acc[rid].count += 1;
            if (summary.email) {
                if (!acc[rid].editors.includes(summary.name)) {
                acc[rid].editors.push(summary.name);
                }
                acc[rid].editorCounts[summary.name] = (acc[rid].editorCounts[summary.name] || 0) + 1;
            }
            // Track latest edit
            if (summary.created_at) {
                const prev = acc[rid].latest;
                if (
                !prev ||
                new Date(summary.created_at).getTime() > new Date(prev.editedAt).getTime()
                ) {
                acc[rid].latest = {
                    name: summary.name || '',
                    email: summary.email || '',
                    editedAt: summary.created_at
                };
                }
            }
            return acc;
            }, {} as Record<string, {
            count: number;
            editors: string[];
            editorCounts: Record<string, number>;
            latest: { name: string; email: string; editedAt: string } | null;
            }>) || {};
        }

        // Helper to get time from now as a string
        function timeFromNow(dateString: string): string {
            const now = new Date();
            const then = new Date(dateString);
            const diffMs = now.getTime() - then.getTime();
            const diffSec = Math.floor(diffMs / 1000);
            if (diffSec < 60) return `${diffSec}s ago`;
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return `${diffMin}m ago`;
            const diffHr = Math.floor(diffMin / 60);
            if (diffHr < 24) return `${diffHr}h ago`;
            const diffDay = Math.floor(diffHr / 24);
            return `${diffDay}d ago`;
        }

        // Attach edit history to each record
        const recordsWithEditHistory = processedRecords?.map(record => {
            const summary = summariesMap[record.id] || {
            count: 0,
            editors: [],
            editorCounts: {},
            latest: null
            };
            return {
            ...record,
            editHistory: {
                count: summary.count,
                editors: summary.editors,
                editorCounts: summary.editorCounts,
                latestEditor: summary.latest
                ? {
                    name: summary.latest.name,
                    email: summary.latest.email,
                    // Use createdAt instead of updatedAt
                    editedAt: summary.latest.editedAt,
                    timeFromNow: timeFromNow(summary.latest.editedAt)
                }
                : null
            }
            };
        }) || [];

        // Sort records by id:number in descending order
        const sortedRecords = (recordsWithEditHistory || []).sort((a:any, b:any) => Number(b.id) - Number(a.id));
        return res.status(200).json(sortedRecords);
    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Server error', details: (error instanceof Error ? error.message : String(error)) });
    }
}
