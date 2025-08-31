import { useState } from "react";
import Link from "next/link";
import { GetServerSideProps } from "next";
import { createClient } from "@supabase/supabase-js";

// Types
interface Author {
  id: number;
  name: string;
  description: string | null;
  cover_url: string | null;
  created_at: string;
}

interface AuthorsPageProps {
  authors: Author[];
  total: number;
  currentPage: number;
  totalPages: number;
}

// Helper function to get initials
const getInitials = (name: string): string => {
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
};

// Modal Component
const AuthorModal = ({ author, isOpen, onClose }: { author: Author | null; isOpen: boolean; onClose: () => void }) => {
  if (!isOpen || !author) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl">
          ×
        </button>

        <div className="flex items-center mb-4">
          {author.cover_url ? (
            <img src={author.cover_url} alt={author.name} className="w-16 h-16 rounded-full object-cover mr-4" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-500 text-white flex items-center justify-center text-xl font-semibold mr-4">
              {getInitials(author.name)}
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{author.name}</h2>
            {/* <p className="text-sm text-gray-500">Joined {new Date(author.created_at).toLocaleDateString()}</p> */}
          </div>
        </div>

        {author.description && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">About</h3>
            <p className="text-gray-600 leading-relaxed">{author.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Author Card Component
const AuthorCard = ({ author, onClick }: { author: Author; onClick: () => void }) => {
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center mb-3">
        {author.cover_url ? (
          <img src={author.cover_url} alt={author.name} className="w-12 h-12 rounded-full object-cover mr-3" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold mr-3">
            {getInitials(author.name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{author.name}</h3>
          {/* <p className="text-sm text-gray-500">{new Date(author.created_at).toLocaleDateString()}</p> */}
        </div>
      </div>

      {author.description && <p className="text-gray-600 text-sm line-clamp-2 leading-relaxed">{author.description}</p>}
    </div>
  );
};

// Pagination Component
const Pagination = ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => {
  const pages = [];
  const maxVisiblePages = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center space-x-2 mt-8">
      {currentPage > 1 && (
        <Link
          href={`?page=${currentPage - 1}`}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
        >
          Previous
        </Link>
      )}

      {startPage > 1 && (
        <>
          <Link
            href="?page=1"
            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
          >
            1
          </Link>
          {startPage > 2 && <span className="text-gray-500">...</span>}
        </>
      )}

      {pages.map((page) => (
        <Link
          key={page}
          href={`?page=${page}`}
          className={`px-3 py-2 text-sm border rounded-md ${
            page === currentPage
              ? "bg-blue-500 text-white border-blue-500"
              : "border-gray-300 hover:bg-gray-50 text-gray-700"
          }`}
        >
          {page}
        </Link>
      ))}

      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span className="text-gray-500">...</span>}
          <Link
            href={`?page=${totalPages}`}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
          >
            {totalPages}
          </Link>
        </>
      )}

      {currentPage < totalPages && (
        <Link
          href={`?page=${currentPage + 1}`}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
        >
          Next
        </Link>
      )}
    </div>
  );
};

// Main Component
export default function AuthorsPage({ authors, total, currentPage, totalPages }: AuthorsPageProps) {
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = (author: Author) => {
    setSelectedAuthor(author);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedAuthor(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mw-full px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
            ← Back to table
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Authors</h1>
          <p className="text-gray-600">{total} authors found</p>
        </div>

        {/* Authors Grid */}
        {authors.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {authors.map((author) => (
                <AuthorCard key={author.id} author={author} onClick={() => openModal(author)} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && <Pagination currentPage={currentPage} totalPages={totalPages} />}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No authors found.</p>
          </div>
        )}
      </div>

      {/* Modal */}
      <AuthorModal author={selectedAuthor} isOpen={isModalOpen} onClose={closeModal} />
    </div>
  );
}

// Server-side props
export const getServerSideProps: GetServerSideProps = async (context) => {
  const page = parseInt(context.query.page as string) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Get total count
    const { count } = await supabase.from("authors").select("*", { count: "exact", head: true });

    // Get paginated authors
    const { data: authors, error } = await supabase
      .from("authors")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      props: {
        authors: authors || [],
        total: count || 0,
        currentPage: page,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Error fetching authors:", error);
    return {
      props: {
        authors: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      },
    };
  }
};
