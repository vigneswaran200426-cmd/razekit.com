import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { timeAgo } from '@/lib/community-utils';
import ReportModal from './ReportModal';
import { Trash2, Edit, Flag, Reply, Send, Loader2 } from 'lucide-react';

export default function CommentThread({ postId, user }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const load = async () => {
    const cs = await base44.entities.Comment.filter({ post_id: postId }, '-created_date', 300).catch(() => []);
    setComments(cs.filter(c => c.moderation_status !== 'removed'));
    setLoading(false);
  };
  useEffect(() => { load();   }, [postId]);

  const submit = async () => {
    if (!text.trim() || !user) return;
    setSubmitting(true);
    try {
      await base44.entities.Comment.create({ post_id: postId, author_id: user.id, author_name: user.full_name, author_username: user.username || '', text: text.trim() });
      setText(''); await load();
    } catch { toast({ title: 'Failed to post comment', variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  const reply = async () => {
    if (!replyText.trim() || !user) return;
    setSubmitting(true);
    try {
      await base44.entities.Comment.create({ post_id: postId, author_id: user.id, author_name: user.full_name, author_username: user.username || '', text: replyText.trim(), parent_id: replyTo });
      setReplyText(''); setReplyTo(null); await load();
    } catch { toast({ title: 'Failed to post reply', variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  const saveEdit = async (c) => {
    if (!editText.trim()) return;
    try { await base44.entities.Comment.update(c.id, { text: editText.trim() }); setEditingId(null); await load(); }
    catch { toast({ title: 'Edit failed', variant: 'destructive' }); }
  };

  const del = async (c) => {
    if (!confirm('Delete this comment?')) return;
    try { await base44.entities.Comment.delete(c.id); await load(); }
    catch (e) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  const byParent = new Map();
  const roots = [];
  for (const c of comments) {
    if (c.parent_id) { if (!byParent.has(c.parent_id)) byParent.set(c.parent_id, []); byParent.get(c.parent_id).push(c); }
    else roots.push(c);
  }

  const renderComment = (c, depth = 0) => (
    <div key={c.id} className={depth > 0 ? 'ml-4 pl-3 border-l border-border' : ''}>
      <div className="py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className="font-medium text-foreground">{c.author_name}</span>
          {c.author_username && <span className="text-primary">@{c.author_username}</span>}
          <span>· {timeAgo(c.created_date)}</span>
        </div>
        {editingId === c.id ? (
          <div className="flex gap-2">
            <input value={editText} onChange={e => setEditText(e.target.value)} className="flex-1 h-9 rounded-lg border border-input bg-transparent px-3 text-sm" autoFocus />
            <button onClick={() => saveEdit(c)} className="text-xs px-3 rounded-lg bg-primary text-primary-foreground">Save</button>
            <button onClick={() => setEditingId(null)} className="text-xs px-3 rounded-lg bg-secondary">Cancel</button>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-line">{c.text}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          <button onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }} className="flex items-center gap-1 hover:text-foreground"><Reply className="w-3 h-3" /> Reply</button>
          {user?.id === c.created_by_id && <button onClick={() => { setEditingId(c.id); setEditText(c.text); }} className="flex items-center gap-1 hover:text-foreground"><Edit className="w-3 h-3" /> Edit</button>}
          {user?.id === c.created_by_id && <button onClick={() => del(c)} className="flex items-center gap-1 hover:text-destructive"><Trash2 className="w-3 h-3" /> Delete</button>}
          {user?.id !== c.created_by_id && <button onClick={() => setReportTarget({ type: 'comment', id: c.id })} className="flex items-center gap-1 hover:text-foreground"><Flag className="w-3 h-3" /> Report</button>}
        </div>
        {replyTo === c.id && (
          <div className="flex gap-2 mt-2">
            <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={`Reply to ${c.author_name}...`} className="flex-1 h-9 rounded-lg border border-input bg-transparent px-3 text-sm" />
            <button onClick={reply} disabled={submitting} className="text-xs px-3 rounded-lg bg-primary text-primary-foreground">{submitting ? '...' : 'Reply'}</button>
          </div>
        )}
      </div>
      {(byParent.get(c.id) || []).map(r => renderComment(r, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment..." className="flex-1 h-10 rounded-lg border border-input bg-transparent px-3 text-sm" onKeyDown={e => e.key === 'Enter' && submit()} />
        <button onClick={submit} disabled={submitting || !text.trim()} className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : roots.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No comments yet. Start the conversation.</p>
      ) : (
        <div className="divide-y divide-border">{roots.map(c => renderComment(c))}</div>
      )}

      <ReportModal open={!!reportTarget} onClose={() => setReportTarget(null)} targetType={reportTarget?.type} targetId={reportTarget?.id} user={user} />
    </div>
  );
}