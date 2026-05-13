import { Routes, Route, NavLink } from 'react-router';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';

function App() {
  return (
    <div className="min-h-svh bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex gap-6">
        <NavLink to="/" end className="text-gray-700 hover:text-blue-600 font-medium">
          Home
        </NavLink>
        <NavLink to="/about" className="text-gray-700 hover:text-blue-600 font-medium">
          About
        </NavLink>
        <NavLink to="/contact" className="text-gray-700 hover:text-blue-600 font-medium">
          Contact
        </NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
      </Routes>
    </div>
  );
}

export default App;
