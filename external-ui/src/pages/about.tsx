import { Link } from 'react-router';

export function About() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">About</h1>
      <p className="text-gray-600 mb-4">
        This is a sample page demonstrating client-side routing with react-router-dom and Tailwind CSS v4 styling.
      </p>
      <Link to="/" className="text-blue-600 underline hover:text-blue-800">
        Back to Home
      </Link>
    </div>
  );
}
