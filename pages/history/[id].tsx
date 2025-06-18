import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';

export const getServerSideProps: GetServerSideProps = async (context) => {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { id } = context.query;

    const { data: rawHistory, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('record_id', id);

    const history = rawHistory?.map(record => ({
        ...record,
        created_at: new Date(record.created_at).toLocaleString(),
    })).reverse();

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

const HistoryPage = ({ history }: { history: any[] }) => {
    return (
        <div className="p-5 max-w-full overflow-x-auto">
            <div className="flex justify-center items-center mb-5 gap-5">
                <h1 className="text-2xl font-bold">History Page</h1>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none"
                >
                    Reload for Latest History
                </button>
            </div>
            <table className="w-full border-collapse text-left">
                <thead>
                    <tr>
                        <th className="border-b-2 border-gray-300 px-4 py-2">ID</th>
                        <th className="border-b-2 border-gray-300 px-4 py-2">Created At</th>
                        <th className="border-b-2 border-gray-300 px-4 py-2">Summary</th>
                        <th className="border-b-2 border-gray-300 px-4 py-2">Email</th>
                        <th className="border-b-2 border-gray-300 px-4 py-2">Name</th>
                        <th className="border-b-2 border-gray-300 px-4 py-2">Record ID</th>
                    </tr>
                </thead>
                <tbody>
                    {history.map((record) => (
                        <tr key={record.id} className="odd:bg-gray-100">
                            <td className="border-b border-gray-300 px-4 py-2">{record.id}</td>
                            <td className="border-b border-gray-300 px-4 py-2">{record.created_at}</td>
                            <td className="border-b border-gray-300 px-4 py-2">{JSON.parse(record.summary).join(', ')}</td>
                            <td className="border-b border-gray-300 px-4 py-2">{JSON.parse(record.email).join(', ')}</td>
                            <td className="border-b border-gray-300 px-4 py-2">{JSON.parse(record.name).join(', ')}</td>
                            <td className="border-b border-gray-300 px-4 py-2">{record.record_id}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default HistoryPage;