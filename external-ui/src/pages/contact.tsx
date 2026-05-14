import { Link } from 'react-router';

export function Contact() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Contact</h1>
      <p className="text-gray-600 mb-6">Get in touch with us.</p>
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <input type="text" placeholder="Name" className="border border-gray-300 rounded px-3 py-2" />
        <input type="email" placeholder="Email" className="border border-gray-300 rounded px-3 py-2" />
        <textarea placeholder="Message" rows={4} className="border border-gray-300 rounded px-3 py-2" />
        <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 self-start">
          Send
        </button>
      </form>
      <Link to="/" className="text-blue-600 underline hover:text-blue-800 mt-6 inline-block">
        Back to Home
      </Link>
    </div>
  );
}
