import { Link, useLocation } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';

// Global floating Help entry point — one destination: the Help page.
// Carries the page the user came from so answers are context-aware.
export default function HelpButton() {
  const location = useLocation();
  if (location.pathname === '/help') return null;
  return (
    <Link
      to="/help"
      state={{ from: location.pathname }}
      title="Help"
      aria-label="Help"
      className="fixed bottom-20 right-4 md:hidden z-40 w-10 h-10 rounded-full bg-white border border-primary/25 text-primary shadow-glass flex items-center justify-center transition-all duration-200 hover:border-primary/60 active:scale-95"
    >
      <HelpCircle className="w-5 h-5" />
    </Link>
  );
}