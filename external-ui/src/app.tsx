import { Routes, Route } from 'react-router';
import { AppLayout } from './layouts/app-layout';
import { Home } from './pages/home';
import { About } from './pages/about';
import { Contact } from './pages/contact';
import { Callback } from './pages/callback';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/auth/callback" element={<Callback />} />
      </Routes>
    </AppLayout>
  );
}
