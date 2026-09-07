import { useState, useEffect, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Video, GitCompare, GraduationCap, Trophy, FileCode, ChevronLeft, ChevronRight, Check, Hash, Send, Pause, Play, XCircle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { careerProfile } from '@/components/home/mockData';
import { getUserProfile } from '@/lib/username-utils';
import { POST_CATEGORIES } from './feedData';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const POST_TYPES = [
  { key: 'video', label: 'Video', icon: Video, desc: 'Edited video content' },
  { key: 'image', label: 'Image', icon: ImageIcon, desc: 'Single image post' },
  { key: 'before_after', label: 'Before & After', icon: GitCompare, desc: 'Transformation showcase' },
  { key: 'tutorial', label: 'Tutorial', icon: GraduationCap, desc: 'Editing tutorial' },
  { key: 'winning', label: 'Winning Project', icon: Trophy, desc: 'Contest winning work' },
  { key: 'breakdown', label: 'Project Breakdown', icon: FileCode, desc: 'Behind the scenes' },
];

const STEPS = ['Type', 'Upload', 'Details', 'Preview', 'Publish'];

export default function CreatePostModal({ open, onClose, onPublished }) {
  const [step, setStep] = useState(0);
  const [postType, setPostType] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [fileInfo, setFileInfo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [category, setCategory] = useState('Edited Videos');
  const [software, setSoftware] = useState('');
  const [editingStyle, setEditingStyle] = useState('');
  const [contestName, setContestName] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const fileRef = useRef(null);
  const progressRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      base44.auth.me().catch(() => null).then(async u => {
        setUser(u);
        if (u?.id) setProfile(await getUserProfile(u.id));
      });
    } else {
      setStep(0); setPostType(''); setMediaUrl(''); setFileInfo(null);
      setUploadProgress(0); setCaption(''); setHashtags(''); setSoftware('');
      setEditingStyle(''); setContestName(''); setCategory('Edited Videos');
      setUploading(false); setPaused(false);
      if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    }
  }, [open]);

  if (!open) return null;

  const handleClose = () => { onClose(); };

  const startProgress = () => {
    setUploadProgress(0);
    progressRef.current = setInterval(() => {
      setUploadProgress(prev => prev >= 90 ? prev : prev + Math.random() * 10 + 5);
    }, 400);
  };

  const stopProgress = () => {
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
  };

  const formatDuration = (s) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  const getVideoMetadata = (file) => new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => resolve(null);
    video.src = URL.createObjectURL(file);
  });

  const handleFileSelect = async (file) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video');
    const info = { name: file.name, size: (file.size / 1048576).toFixed(2) + ' MB', type: isVideo ? 'video' : 'image' };
    if (isVideo) {
      const meta = await getVideoMetadata(file);
      if (meta) { info.duration = formatDuration(meta.duration); info.resolution = `${meta.width}×${meta.height}`; }
    }
    setFileInfo(info);
    setMediaType(isVideo ? 'video' : 'image');
    setUploading(true);
    setPaused(false);
    startProgress();
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setMediaUrl(result.file_url);
      stopProgress();
      setUploadProgress(100);
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
      stopProgress();
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handlePause = () => { setPaused(true); stopProgress(); };
  const handleResume = () => { setPaused(false); startProgress(); };
  const handleCancel = () => { stopProgress(); setUploading(false); setPaused(false); setUploadProgress(0); setMediaUrl(''); setFileInfo(null); };

  const handlePublish = async (status) => {
    if (!mediaUrl || !caption.trim() || !user) return;
    setPublishing(true);
    try {
      await base44.entities.Post.create({
        author_id: user.id,
        author_name: user.full_name || profile?.display_name || 'Creator',
        author_username: profile?.username || 'unknown',
        author_level: careerProfile.level,
        author_verified: careerProfile.level >= 20,
        type: mediaType,
        media_url: mediaUrl,
        caption: caption.trim(),
        hashtags: hashtags.trim(),
        category,
        software: software.trim(),
        editing_style: editingStyle.trim(),
        likes_count: 0, comments_count: 0, shares_count: 0, views_count: 0, saves_count: 0,
        status,
      });
      toast({ title: status === 'published' ? 'Post published!' : 'Saved as draft' });
      onPublished?.();
      handleClose();
    } catch {
      toast({ title: 'Failed to publish', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  const canProceed = [!!postType, !!mediaUrl, !!caption.trim(), true, true][step];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative min-h-screen flex items-start justify-center py-4 md:py-8" onClick={e => e.stopPropagation()}>
        <div className="bg-card border border-border rounded-t-2xl md:rounded-2xl w-full max-w-md">
          {/* Header */}
          <div className="sticky top-0 bg-card/90 backdrop-blur-sm flex items-center justify-between p-4 border-b border-border z-10 rounded-t-2xl">
            <div>
              <h2 className="font-heading font-bold">Create Post</h2>
              <p className="text-xs text-muted-foreground">{STEPS[step]} · Step {step + 1} of 5</p>
            </div>
            <button onClick={handleClose}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center px-4 py-3 gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1 rounded-full transition-all ${i === step ? 'bg-primary' : i < step ? 'bg-primary/60' : 'bg-secondary'}`} />
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="p-4 min-h-[320px]">
            {/* Step 1: Type */}
            {step === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-3">Choose your post type</p>
                <div className="grid grid-cols-2 gap-2">
                  {POST_TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.key} onClick={() => { setPostType(t.key); setMediaType(t.key === 'video' || t.key === 'tutorial' ? 'video' : 'image'); }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${postType === t.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                        <Icon className={`w-6 h-6 ${postType === t.key ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium">{t.label}</span>
                        <span className="text-[10px] text-muted-foreground text-center">{t.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Upload */}
            {step === 1 && (
              <div className="space-y-3">
                {!mediaUrl && !uploading && (
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}
                    onClick={() => fileRef.current?.click()}
                    className="aspect-video rounded-xl border-2 border-dashed border-border bg-secondary/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-colors">
                    <Upload className="w-10 h-10 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Drag & drop or browse</p>
                    <p className="text-xs text-muted-foreground mt-1">Video or Image · Max 100MB</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="video/*,image/*" onChange={e => handleFileSelect(e.target.files[0])} className="hidden" />

                {(uploading || mediaUrl) && fileInfo && (
                  <div className="space-y-3">
                    <div className="aspect-video rounded-xl overflow-hidden bg-secondary relative">
                      {mediaUrl ? (
                        <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                      )}
                    </div>

                    <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">File</span><span className="truncate ml-2 max-w-[200px]">{fileInfo.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span>{fileInfo.size}</span></div>
                      {fileInfo.duration && <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{fileInfo.duration}</span></div>}
                      {fileInfo.resolution && <div className="flex justify-between"><span className="text-muted-foreground">Resolution</span><span>{fileInfo.resolution}</span></div>}
                    </div>

                    {uploading && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{paused ? 'Paused' : 'Uploading...'}</span>
                          <span className="font-medium">{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        {!paused && uploadProgress < 100 && (
                          <p className="text-[10px] text-muted-foreground">~{Math.ceil((100 - uploadProgress) / 10)}s remaining</p>
                        )}
                        <div className="flex gap-2">
                          {paused ? (
                            <button onClick={handleResume} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-secondary"><Play className="w-3 h-3" />Resume</button>
                          ) : (
                            <button onClick={handlePause} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-secondary"><Pause className="w-3 h-3" />Pause</button>
                          )}
                          <button onClick={handleCancel} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-secondary text-destructive"><XCircle className="w-3 h-3" />Cancel</button>
                        </div>
                      </div>
                    )}
                    {mediaUrl && (
                      <div className="flex items-center gap-1.5 text-sm text-success">
                        <Check className="w-4 h-4" /> Upload complete
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Details */}
            {step === 2 && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Caption</label>
                  <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Describe your work..." rows={3} className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Hashtags</label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="motiongraphics vfx colorgrading" className="w-full h-10 rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-10 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    {POST_CATEGORIES.map(c => <option key={c} value={c} className="bg-card">{c}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Software</label>
                    <input value={software} onChange={e => setSoftware(e.target.value)} placeholder="Premiere Pro" className="w-full h-10 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Editing Style</label>
                    <input value={editingStyle} onChange={e => setEditingStyle(e.target.value)} placeholder="Cinematic" className="w-full h-10 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Contest Name (optional)</label>
                  <input value={contestName} onChange={e => setContestName(e.target.value)} placeholder="Tech Startup Brand Promo" className="w-full h-10 rounded-lg border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                </div>
              </div>
            )}

            {/* Step 4: Preview */}
            {step === 3 && (
              <div>
                <p className="text-sm text-muted-foreground mb-3">Preview how your post will appear</p>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                      <span className="font-heading text-sm font-bold text-primary">{(user?.full_name || 'Y')[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{user?.full_name || 'You'}</p>
                      <p className="text-xs text-primary">@{profile?.username || 'you'} · Lv {careerProfile.level}</p>
                    </div>
                  </div>
                  <div className="aspect-video bg-secondary">
                    {mediaUrl && <img src={mediaUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-3">
                    <p className="text-sm line-clamp-3">{caption || 'Your caption will appear here'}</p>
                    {hashtags && <p className="text-sm text-primary mt-1.5">{hashtags}</p>}
                    {(software || editingStyle) && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        {software && <span className="px-2 py-0.5 rounded bg-secondary">🖥️ {software}</span>}
                        {editingStyle && <span className="px-2 py-0.5 rounded bg-secondary">🎨 {editingStyle}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Publish */}
            {step === 4 && (
              <div className="space-y-3">
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                    <Check className="w-8 h-8 text-success" />
                  </div>
                  <p className="font-heading text-lg font-bold">Ready to publish!</p>
                  <p className="text-sm text-muted-foreground">Your post is ready to go live</p>
                </div>
                <Button className="w-full h-12" onClick={() => handlePublish('published')} disabled={publishing}>
                  {publishing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Publishing...</> : <><Send className="w-4 h-4 mr-2" />Publish Now</>}
                </Button>
                <Button variant="outline" className="w-full h-10" onClick={() => handlePublish('draft')} disabled={publishing}>Save as Draft</Button>
                <Button variant="ghost" className="w-full h-10 text-muted-foreground" disabled>📅 Schedule (Coming Soon)</Button>
              </div>
            )}
          </div>

          {/* Navigation */}
          {step < 4 && (
            <div className="flex gap-2 p-4 border-t border-border">
              {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}><ChevronLeft className="w-4 h-4 mr-1" />Back</Button>}
              <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={!canProceed}>
                Next<ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}