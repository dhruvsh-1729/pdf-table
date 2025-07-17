import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState } from 'react';

export const getServerSideProps: GetServerSideProps = async (context) => {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { id } = context.query;

    const { data: rawHistory, error } = await supabase
        .from('conclusions')
        .select('*')
        .eq('record_id', id);

    // String cleanup
    const processValue = (value: any) => {
        if (typeof value === 'string') {
            let parsed: any = value;
            try {
                parsed = JSON.parse(value);
                if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
                    parsed = parsed[0];
                }
            } catch {
                parsed = value;
            }
            if (typeof parsed === 'string') {
                parsed = parsed
                    .replace(/\\r\\n|\\n|\\r/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\'/g, "'")
                    .replace(/\\\\/g, '\\')
                    .trim();
                if (parsed.startsWith('"') && parsed.endsWith('"')) {
                    parsed = parsed.slice(1, -1);
                }
                if (parsed.startsWith('[') && parsed.endsWith(']')) {
                    parsed = parsed.slice(1, -1);
                    if (parsed.startsWith('"') && parsed.endsWith('"')) {
                        parsed = parsed.slice(1, -1);
                    }
                }
            }
            return parsed;
        }
        return value;
    };

    // Not really used in the current component, but left for clarity
    const cleanedHistory = rawHistory?.map(record => {
        const formattedRecord: any = {};
        for (const key in record) {
            formattedRecord[key] = processValue(record[key]);
        }
        return formattedRecord;
    });

    const history = rawHistory?.map(record => ({
        ...record,
        created_at: new Date(record.created_at).toLocaleString(),
    })).reverse() || [];

    if (error) {
        console.error(error);
        return { props: { history: [] } };
    }

    return {
        props: {
            history,
        },
    };
};

const ConclusionHistoryPage = ({ history }: { history: any[] }) => {
    const [mode, setMode] = useState<'diff' | 'normal'>('normal');
    const hasMultipleRecords = history.length >= 2;

    // Helper for word-by-word diffing
    const diffWords = (oldText: string, newText: string) => {
        const oldWords = oldText.split(/\s+/);
        const newWords = newText.split(/\s+/);
        const result: React.ReactNode[] = [];
        let i = 0, j = 0;

        while (i < oldWords.length || j < newWords.length) {
            if (i < oldWords.length && j < newWords.length && oldWords[i] === newWords[j]) {
                result.push(<span key={`same-${i}-${j}`}>{oldWords[i]} </span>);
                i++; j++;
            } else if (j < newWords.length && !oldWords.includes(newWords[j])) {
                result.push(<span key={`add-${i}-${j}`} className="bg-green-200">{newWords[j]} </span>);
                j++;
            } else if (i < oldWords.length && !newWords.includes(oldWords[i])) {
                result.push(<span key={`rem-${i}-${j}`} className="bg-red-100 text-red-700 line-through">{oldWords[i]} </span>);
                i++;
            } else {
                if (i < oldWords.length) {
                    result.push(<span key={`rem2-${i}-${j}`} className="bg-red-100 text-red-700 line-through">{oldWords[i]} </span>);
                    i++;
                }
                if (j < newWords.length) {
                    result.push(<span key={`add2-${i}-${j}`} className="bg-green-200">{newWords[j]} </span>);
                    j++;
                }
            }
        }
        return result;
    };

    return (
        <div className="p-5 w-full max-w-screen overflow-x-hidden">
            <div className="flex justify-center items-center mb-5 gap-5">
                <h1 className="text-2xl font-bold">Conclusion History Page</h1>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none"
                >
                    Reload for Latest Conclusion History
                </button>
            </div>
            <div className="space-y-8">
                {history.length === 0 ? (
                    <div className="text-center text-gray-500">Not enough conclusion edits to show differences.</div>
                ) : (
                    <>
                        {/* Mode switcher only if multiple records */}
                        {hasMultipleRecords && (
                            <div className="flex justify-end mb-4">
                                <button
                                    className={`px-3 py-1 rounded-l ${mode === 'normal' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                                    onClick={() => setMode('normal')}
                                >
                                    Normal Mode
                                </button>
                                <button
                                    className={`px-3 py-1 rounded-r ${mode === 'diff' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                                    onClick={() => setMode('diff')}
                                >
                                    Diff Mode
                                </button>
                            </div>
                        )}

                        {/* Always show normal mode if at least 1 record */}
                        {(mode === 'normal' || !hasMultipleRecords) && (
                            <div className="overflow-x-auto w-full max-w-full">
                                <table className="min-w-[600px] w-full bg-white border rounded shadow table-fixed">
                                    <colgroup>
                                        <col style={{ width: '5%' }} />
                                        <col style={{ width: '18%' }} />
                                        <col style={{ width: '57%' }} />
                                        <col style={{ width: '20%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th className="py-2 px-4 border-b">#</th>
                                            <th className="py-2 px-4 border-b">Created At</th>
                                            <th className="py-2 px-4 border-b">Conclusion</th>
                                            <th className="py-2 px-4 border-b">By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((rec, i) => (
                                            <tr key={rec.id}>
                                                <td className="py-2 px-4 border-b truncate">{history.length - i}</td>
                                                <td className="py-2 px-4 border-b truncate">{rec.created_at}</td>
                                                <td className="py-2 px-4 border-b whitespace-pre-line break-words truncate">
                                                    {Array.isArray(rec.conclusion)
                                                        ? rec.conclusion.join('\n')
                                                        : (() => {
                                                            try {
                                                                return JSON.parse(rec.conclusion).join('\n');
                                                            } catch {
                                                                return String(rec.conclusion);
                                                            }
                                                        })()
                                                    }
                                                </td>
                                                <td className="py-2 px-4 border-b truncate">
                                                    {(() => {
                                                        try {
                                                            return `${JSON.parse(rec.name).join(', ')} (${JSON.parse(rec.email).join(', ')})`;
                                                        } catch {
                                                            return '';
                                                        }
                                                    })()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Diff mode only if 2 or more records */}
                        {hasMultipleRecords && mode === 'diff' && (
                            <div className="space-y-6">
                                {history.slice(1).map((record, idx) => {
                                    const prev = history[idx];
                                    let prevConclusion: string[] = [];
                                    let currConclusion: string[] = [];
                                    try {
                                        prevConclusion = JSON.parse(prev.conclusion);
                                        currConclusion = JSON.parse(record.conclusion);
                                    } catch {
                                        prevConclusion = [String(prev.conclusion)];
                                        currConclusion = [String(record.conclusion)];
                                    }
                                    return (
                                        <div key={record.id} className="border rounded p-4 bg-white shadow mb-6 max-w-full overflow-x-auto">
                                            <div className="mb-2 text-sm text-gray-600">
                                                <span className="font-semibold">Change {history.length - (idx + 1)} → {history.length - idx}</span>
                                                <span className="ml-4">({prev.created_at} , {record.created_at})</span>
                                            </div>
                                            <div>
                                                <div className="font-semibold mb-1">Conclusion Difference</div>
                                                <pre className="bg-gray-100 p-3 rounded overflow-x-auto text-sm whitespace-pre-wrap break-words max-w-full">
                                                    {currConclusion.map((line, i) => (
                                                        <div key={i}>
                                                            {diffWords(prevConclusion[i] ?? "", line)}
                                                        </div>
                                                    ))}
                                                </pre>
                                            </div>
                                            <div className="mt-2 text-xs text-gray-500">
                                                <span>By: {(() => {
                                                    try {
                                                        return `${JSON.parse(record.name).join(', ')} (${JSON.parse(record.email).join(', ')})`;
                                                    } catch {
                                                        return '';
                                                    }
                                                })()}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ConclusionHistoryPage;
