import { useRef } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Undo2, Redo2 } from 'lucide-react';
import { BRIEF_PROMPTS } from '@/lib/campaign-brief';

const modules = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
  ],
};

export default function CampaignBriefSection({ data, update }) {
  const qRef = useRef(null);

  const insertPrompt = (text) => {
    const ed = qRef.current?.getEditor();
    if (!ed) return;
    const range = ed.getSelection(true);
    ed.insertText(range.index, `\n${text}`);
    ed.setSelection(range.index + text.length + 1);
  };

  const history = (fn) => { const ed = qRef.current?.getEditor(); ed?.history?.[fn]?.(); };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {BRIEF_PROMPTS.map((p) => (
          <button key={p.label} type="button" onClick={() => insertPrompt(p.text)}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
            + {p.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => history('undo')} title="Undo" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-accent/10 hover:text-accent">
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => history('redo')} title="Redo" className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-accent/10 hover:text-accent">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="campaign-editor">
        <ReactQuill ref={qRef} theme="snow" value={data.brief || ''} onChange={(v) => update({ brief: v })}
          modules={modules} placeholder="Write the campaign brief — goal, creative concept, context, expectations, tone, style, audience, key message, must-include, must-avoid…" />
      </div>
      <p className="text-xs text-muted-foreground mt-2">The chips above add optional structure — write freely, nothing is enforced.</p>
    </div>
  );
}