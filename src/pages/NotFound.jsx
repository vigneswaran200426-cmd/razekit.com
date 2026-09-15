import { Compass } from 'lucide-react';
import { Button } from '@/components/ui';
import { RazekitLogo } from '@/components/Brand';
import Seo from '@/components/Seo';

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-bg px-6 text-center">
      {/* A static SPA host rewrites every unknown path to index.html, so this
          page is served with a 200 — a soft 404. Google cannot see the status
          it deserves, so it is told directly not to index this, which stops
          mistyped and stale URLs accumulating in search results under a title
          that promises a real page. */}
      <Seo noindex title="Page not found" description="This RazeKit page does not exist or has moved." />
      <div>
        <div className="flex justify-center mb-6"><RazekitLogo mark={36} word={24} /></div>
        <p className="font-display text-6xl font-extrabold text-ink">404</p>
        <p className="mt-2 text-muted">This page doesn’t exist or has moved.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button to="/"><Compass className="w-4 h-4" />Go home</Button>
          <Button to="/explore" variant="secondary">Explore contests</Button>
        </div>
      </div>
    </div>
  );
}
