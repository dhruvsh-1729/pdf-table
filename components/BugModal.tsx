import React, { useState } from 'react';

interface BugModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const BugModal: React.FC<BugModalProps> = ({ isOpen, onClose }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [images, setImages] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setImages([...images, ...Array.from(event.target.files)]);
        }
    };

    const onSubmit = async (data: { title: string; description: string; images: File[] }) => {
        setLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('title', data.title);
            formData.append('description', data.description);
            data.images.forEach((img) => {
                formData.append('images', img);
            });

            const response = await fetch('/api/bug', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                setError('Failed to submit bug report. Please try again later.');
                return;
            }

            const result = await response.json();
            if (!result.success) {
                setError(result.error || 'Something went wrong');
                return;
            }
            // Optionally handle success (e.g., show a toast)
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!title.trim() || !description.trim()) {
            setError('Title and description are required.');
            return;
        }
        await onSubmit({ title, description, images });
        setTitle('');
        setDescription('');
        setImages([]);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex justify-center items-center">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl font-bold focus:outline-none"
                    aria-label="Close"
                    disabled={loading}
                >
                    ×
                </button>
                <h2 className="text-3xl font-bold mb-6 text-gray-900 text-center">Report a Bug</h2>
                {error && (
                    <div className="mb-4 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-center">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="title" className="block text-base font-medium text-gray-700 mb-1">
                            Title
                        </label>
                        <input
                            type="text"
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base px-4 py-2"
                            placeholder="Short summary of the bug"
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-base font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            rows={8}
                            className="mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base px-4 py-2 resize-none"
                            placeholder="Describe the bug in detail"
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label htmlFor="images" className="block text-base font-medium text-gray-700 mb-1">
                            Add Images
                        </label>
                        <input
                            type="file"
                            id="images"
                            multiple
                            accept="image/*"
                            onChange={handleImageChange}
                            className="mt-1 block w-full text-base text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-base file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
                            disabled={loading}
                        />
                    </div>
                    {images.length > 0 && (
                        <div>
                            <label className="block text-base font-medium text-gray-700 mb-1">Uploaded Images</label>
                            <div className="mt-2 flex flex-wrap gap-4">
                                {images.map((image, index) => (
                                    <div key={index} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 shadow">
                                        <img
                                            src={URL.createObjectURL(image)}
                                            alt={`Uploaded preview ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setImages(images.filter((_, i) => i !== index))}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-lg shadow"
                                            aria-label="Remove image"
                                            disabled={loading}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={`px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition flex items-center justify-center ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    Submitting...
                                </span>
                            ) : (
                                'Submit'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BugModal;