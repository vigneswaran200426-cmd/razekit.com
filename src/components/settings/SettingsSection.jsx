import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function SettingsSection({ title, children }) {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5 pb-8">
      <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>
      <h1 className="font-heading text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}