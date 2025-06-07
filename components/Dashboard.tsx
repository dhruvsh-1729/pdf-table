import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { Bar, Pie, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

const Dashboard = () => {
    const router = useRouter();
    const [insights, setInsights] = useState<any>({
        totalRecords: 0,
        totalSummaries: 0,
        recordsByLanguage: [],
        topAuthors: [],
        recordsOverTime: [],
        recentRecords: [],
    });
    const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
    const [fetchedEmails, setFetchedEmails] = useState<{ email: string; creator_name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = localStorage.getItem('user');
        if (user) {
            try {
                const parsedUser = JSON.parse(user);
                if (parsedUser && parsedUser.name && parsedUser.email && parsedUser.access) {
                    fetchEmails();
                    fetchInsights();
                } else {
                    router.push('/login');
                }
            } catch (error) {
                console.error('Error parsing user data:', error);
                router.push('/login');
            }
        } else {
            router.push('/login');
        }
    }, []);

    useEffect(() => {
        fetchInsights();
    }, [selectedEmail]);

    const fetchEmails = async () => {
        try {
            const response = await fetch('/api/get-emails');
            if (!response.ok) throw new Error('Failed to fetch emails');
            const data = await response.json();
            setFetchedEmails(data);
        } catch (err) {
            console.error('Error fetching emails:', err);
        }
    };

    const fetchInsights = async () => {
        setLoading(true);
        try {
            const queryParam = selectedEmail ? `?email=${encodeURIComponent(selectedEmail)}` : '';
            const response = await fetch(`/api/insights${queryParam}`);
            if (!response.ok) throw new Error('Failed to fetch insights');
            const data = await response.json();
            setInsights(data);
            setError(null);
        } catch (err) {
            console.error('Error:', err);
            setError('Failed to load insights');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;
    if (error) return <div className="text-red-500 text-center">{error}</div>;

    // const recordsByLanguageData = {
    //     labels: insights.recordsByLanguage.map((item: any) => item.language),
    //     datasets: [{
    //         label: 'Records by Language',
    //         data: insights.recordsByLanguage.map((item: any) => item.count),
    //         backgroundColor: 'rgba(75, 192, 192, 0.6)',
    //     }],
    // };

    // const topAuthorsData = {
    //     labels: insights.topAuthors.map((item: any) => item.authors),
    //     datasets: [{
    //         label: 'Top Authors',
    //         data: insights.topAuthors.map((item: any) => item.count),
    //         backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
    //     }],
    // };

    // const recordsOverTimeData = {
    //     labels: insights.recordsOverTime.map((item: any) => item.month),
    //     datasets: [{
    //         label: 'Records Over Time',
    //         data: insights.recordsOverTime.map((item: any) => item.count),
    //         fill: false,
    //         borderColor: 'rgb(75, 192, 192)',
    //         tension: 0.1,
    //     }],
    // };

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-blue-600 text-white p-4">
                <h1 className="text-2xl font-bold">Insights Dashboard</h1>
            </div>

            {/* User Filter */}
            <div className="p-4">
                <label htmlFor="email-select" className="block text-sm font-medium text-gray-700">
                    Filter by User:
                </label>
                <select
                    id="email-select"
                    value={selectedEmail || ''}
                    onChange={(e) => setSelectedEmail(e.target.value || null)}
                    className="mt-1 block w-full max-w-xs py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                    <option value="">All Users</option>
                    {fetchedEmails.map((user) => (
                        <option key={user.email} value={user.email}>
                            {user.creator_name} ({user.email})
                        </option>
                    ))}
                </select>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-gray-700">Total Records</h2>
                    <p className="text-3xl text-blue-600">{insights.totalRecords}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-gray-700">Total Summaries</h2>
                    <p className="text-3xl text-green-600">{insights.totalSummaries}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-gray-700">Avg. Summaries per Record</h2>
                    <p className="text-3xl text-purple-600">
                        {insights.totalRecords ? (insights.totalSummaries / insights.totalRecords).toFixed(2) : 0}
                    </p>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                {/* <div className="bg-white p-4 rounded-lg shadow h-96">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Records by Language</h2>
                    <Bar data={recordsByLanguageData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div> */}
                {/* <div className="bg-white p-4 rounded-lg shadow h-96">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Top Authors</h2>
                    <Pie data={topAuthorsData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div> */}
            </div>

            {/* <div className="p-4">
                <div className="bg-white p-4 rounded-lg shadow h-96">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Records Over Time</h2>
                    <Line data={recordsOverTimeData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div>
            </div> */}

            {/* Recent Records Table */}
            <div className="p-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Recent Records</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creator</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {insights.recentRecords.map((record: any) => (
                                    <tr key={record.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.timestamp}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.creator_name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.email}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;