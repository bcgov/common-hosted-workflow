import { Link } from 'react-router';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-4">
      <h1 className="text-4xl font-bold text-gray-800">Hello, World!</h1>
      <p className="text-gray-600">Welcome to the external UI app.</p>
      <div className="flex gap-4 mt-4">
        <Link to="/about" className="text-blue-600 underline hover:text-blue-800">
          About
        </Link>
        <Link to="/contact" className="text-blue-600 underline hover:text-blue-800">
          Contact
        </Link>
      </div>
    </div>
  );
}
