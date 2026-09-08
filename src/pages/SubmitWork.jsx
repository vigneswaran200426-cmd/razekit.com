import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, UploadCloud, CheckCircle2, Film, Loader2 } from 'lucide-react';
import { entities, uploads } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, Button, Input, Label, Spinner, Badge } from '@/components/ui';

const PLATFORMS = ['Instagram', 'YouTube', 'TikTok', 'Facebook', 'X', 'LinkedIn', 'Other'];

export default function SubmitWork() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [contest, setContest] = useState(null);
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [f, setF] = useState({ title: '', description: '', platform: 'Instagram', live_url: '', final_asset_uri: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const c = await entities.Contest.get(id).catch(() => null);
      setContest(c);
      const mine = await entities.Submission.filter({ contest_id: id, created_by_id: user.id }, '-created_date', 1).catch(() => []);
      const s = (mine || [])[0] || null;
      setSub(s);
      if (s) setF((p) => ({ ...p, title: s.title || '', description: s.description || '', platform: s.platform || 'Instagram', live_url: s.live_url || '', final_asset_uri: s.final_asset_uri || '' }));
      setLoading(false);
    })();
  }, [id, user?.id]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await uploads.privateFile(file);
      setF((p) => ({ ...p, final_asset_uri: file_uri }));
      try { const { signed_url } = await uploads.signedUrl(file_uri, 3600); setPreview({ url: signed_url, type: file.type }); } catch {}
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!f.final_asset_uri && !f.live_url.trim()) return;
    setSubmitting(true);
    try {
      const payload = { title: f.title.trim(), description: f.description.trim(), platform: f.platform, live_url: f.live_url.trim(),
        final_asset_uri: f.final_asset_uri, status: 'submitted', submitted_at: new Date().toISOString() };
      let s = sub;
      if (s) await entities.Submission.update(s.id, payload);
      else s = await entities.Submission.create({ contest_id: id, client_id: contest?.created_by_id, ...payload });
      if (contest && ['open', 'joined', 'working'].includes(contest.status)) await entities.Contest.update(id, { status: 'submitted' }).catch(() => {});
      await entities.Notification.create({ type: 'submission_uploaded', title: 'New submission', description: contest?.title, contest_id: id, recipient_user_id: contest?.created_by_id }).catch(() => {});
      setDone(true);
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-[50vh] grid place-items-center"><Spinner className="w-7 h-7" /></div>;

  if (done) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <CheckCircle2 className="w-14 h-14 text-success mx-auto" />
      <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">Entry submitted</h1>
      <p className="mt-2 text-muted">Your work is in for “{contest?.title}”. You’ll be notified when the brand reviews it.</p>
      <div className="mt-6 flex justify-center gap-3"><Button to="/work">My work</Button><Button to={`/contest/${id}`} variant="secondary">Contest</Button></div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="w-4 h-4" /> Contest</Link>
      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Submit your work</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">{contest?.title}</h1></div>

      <Card className="p-5">
        <Label>Final creative</Label>
        <input ref={fileRef} type="file" accept="video/*,image/*" onChange={onFile} className="hidden" />
        {preview?.url && preview.type?.startsWith('image') ? (
          <div className="rounded-md overflow-hidden border border-line mb-3"><img src={preview.url} alt="" className="w-full max-h-64 object-contain bg-surface-2" /></div>
        ) : null}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full rounded-md border-2 border-dashed border-line-strong bg-surface-2/40 py-8 flex flex-col items-center gap-2 text-muted hover:border-primary/50 hover:text-ink transition-colors">
          {uploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : f.final_asset_uri ? <CheckCircle2 className="w-6 h-6 text-success" /> : <UploadCloud className="w-6 h-6" />}
          <span className="text-sm font-medium">{uploading ? 'Uploading…' : f.final_asset_uri ? 'File uploaded — replace' : 'Upload video or image'}</span>
        </button>
        {f.final_asset_uri && <p className="mt-2 flex items-center gap-1.5 text-xs text-success"><Film className="w-3.5 h-3.5" /> Private file attached</p>}
      </Card>

      <Card className="p-5 space-y-4">
        <div><Label htmlFor="t">Title</Label><Input id="t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Name your entry" /></div>
        <div><Label htmlFor="d">Notes for the brand</Label>
          <textarea id="d" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Anything the reviewer should know…"
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label htmlFor="p">Platform</Label>
            <select id="p" value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><Label htmlFor="u">Live URL (if published)</Label><Input id="u" value={f.live_url} onChange={(e) => setF({ ...f, live_url: e.target.value })} placeholder="https://…" /></div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" to={`/contest/${id}`}>Cancel</Button>
        <Button loading={submitting} disabled={!f.final_asset_uri && !f.live_url.trim()} onClick={submit}>Submit entry</Button>
      </div>
    </div>
  );
}
