import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Camera, AtSign, Briefcase, Eye, PlusCircle, Image as ImageIcon, Building2, Phone, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import UsernameInput from '@/components/UsernameInput';
import { getUserProfile, saveUsername, checkUsernameAvailable, canChangeUsername, formatDate } from '@/lib/username-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';

const CREATIVE_NEEDS = [
  'Video Editing', 'Motion Graphics', 'Graphic Design', 'Animation',
  'UI/UX', 'Thumbnail Design', 'Social Media Content', 'AI Content', 'Other',
];

export default function EditProfile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [contact, setContact] = useState(null);
  const [pref, setPref] = useState(null);
  const [posts, setPosts] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [bio, setBio] = useState('');
  // Creator fields
  const [title, setTitle] = useState('');
  const [skills, setSkills] = useState('');
  const [categories, setCategories] = useState('');
  // Shared
  const [avatarUrl, setAvatarUrl] = useState('');
  // Client business fields
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [creativeNeeds, setCreativeNeeds] = useState([]);
  // Creator professional fields
  const [experience, setExperience] = useState('');
  const [tools, setTools] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        setDisplayName(me?.full_name || '');
        if (me?.id) {
          const p = await getUserProfile(me.id);
          setProfile(p);
          const contacts = await base44.entities.UserContact.filter({ user_id: me.id }, '-created_date', 1).catch(() => []);
          const ct = contacts[0] || null;
          setContact(ct);
          if (ct?.phone) setPhone(ct.phone);
          if (p?.username) setUsername(p.username);
          if (p?.bio) setBio(p.bio);
          if (p?.professional_title) setTitle(p.professional_title);
          if (p?.skills) setSkills(p.skills);
          if (p?.categories) setCategories(p.categories);
          if (p?.avatar_url) setAvatarUrl(p.avatar_url);
          // Business fields
          if (p?.company_name) setCompanyName(p.company_name);
          if (p?.industry) setIndustry(p.industry);
          if (p?.company_size) setCompanySize(p.company_size);
          if (p?.country) setCountry(p.country);
          if (p?.website) setWebsite(p.website);
          if (p?.business_description) setBusinessDescription(p.business_description);
          if (p?.categories) setCreativeNeeds(p.categories.split(',').map(s => s.trim()).filter(Boolean));
          if (p?.years_experience) setExperience(p.years_experience);
          if (p?.tools) setTools(p.tools);
          if (p?.portfolio_url) setPortfolioUrl(p.portfolio_url);

          const existing = await base44.entities.UserPreference.filter({ user_id: me.id }, '-created_date', 1).catch(() => []);
          let pr = existing[0];
          if (!pr) pr = await base44.entities.UserPreference.create({ user_id: me.id });
          setPref(pr);

          const ps = await base44.entities.Post.filter({ author_id: me.id, status: 'published' }, '-created_date', 6).catch(() => []);
          setPosts(ps);
        }
      } catch {}
    })();
  }, []);

  const isClient = user?.user_role === 'client';

  const cooldown = canChangeUsername(profile?.username_last_changed);
  const usernameChanged = profile?.username && username !== profile.username;
  const canEditUsername = cooldown.canChange;
  const nameChanged = displayName !== (user?.full_name || '');
  const bioChanged = bio !== (profile?.bio || '');

  // Creator change detection
  const titleChanged = title !== (profile?.professional_title || '');
  const skillsChanged = skills !== (profile?.skills || '');
  const categoriesChanged = categories !== (profile?.categories || '');
  const experienceChanged = experience !== (profile?.years_experience || '');
  const toolsChanged = tools !== (profile?.tools || '');
  const portfolioUrlChanged = portfolioUrl !== (profile?.portfolio_url || '');

  // Client business change detection
  const companyNameChanged = companyName !== (profile?.company_name || '');
  const industryChanged = industry !== (profile?.industry || '');
  const companySizeChanged = companySize !== (profile?.company_size || '');
  const countryChanged = country !== (profile?.country || '');
  const websiteChanged = website !== (profile?.website || '');
  const phoneChanged = phone !== (contact?.phone || '');
  const businessDescChanged = businessDescription !== (profile?.business_description || '');
  const creativeNeedsChanged = creativeNeeds.join(',') !== (profile?.categories || '');

  const creatorHasChanges = nameChanged || usernameChanged || bioChanged || titleChanged || skillsChanged || categoriesChanged || experienceChanged || toolsChanged || portfolioUrlChanged;
  const clientHasChanges = nameChanged || usernameChanged || bioChanged || companyNameChanged || industryChanged || companySizeChanged || countryChanged || websiteChanged || phoneChanged || businessDescChanged || creativeNeedsChanged;
  const hasChanges = isClient ? clientHasChanges : creatorHasChanges;

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setAvatarUrl(file_url);
      if (profile?.id) {
        const updated = await base44.entities.UserProfile.update(profile.id, { avatar_url: file_url });
        setProfile(updated);
      }
      toast({ title: isClient ? 'Business logo updated' : 'Profile picture updated' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally { setUploadingAvatar(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (nameChanged) await base44.auth.updateMe({ full_name: displayName });
      let current = profile;
      if (usernameChanged) {
        if (!canEditUsername) { toast({ title: 'Cooldown active', description: `Next change ${formatDate(cooldown.nextDate)}`, variant: 'destructive' }); return; }
        const check = await checkUsernameAvailable(username);
        if (!check.available) { toast({ title: 'Username taken', description: check.error, variant: 'destructive' }); return; }
        current = await saveUsername(user.id, username, displayName);
        await base44.auth.updateMe({ username: username.toLowerCase() });
      }
      const patch = {};
      if (bioChanged) patch.bio = bio;
      if (nameChanged && !usernameChanged) patch.display_name = displayName;
      if (isClient) {
        if (companyNameChanged) patch.company_name = companyName;
        if (industryChanged) patch.industry = industry;
        if (companySizeChanged) patch.company_size = companySize;
        if (countryChanged) patch.country = country;
        if (websiteChanged) patch.website = website;
        if (phoneChanged) patch.phone = phone;
        if (businessDescChanged) patch.business_description = businessDescription;
        if (creativeNeedsChanged) patch.categories = creativeNeeds.join(',');
      } else {
        if (titleChanged) patch.professional_title = title;
        if (skillsChanged) patch.skills = skills;
        if (categoriesChanged) patch.categories = categories;
        if (experienceChanged) patch.years_experience = experience;
        if (toolsChanged) patch.tools = tools;
        if (portfolioUrlChanged) patch.portfolio_url = portfolioUrl;
      }
      if (current?.id && Object.keys(patch).length) {
        current = await base44.entities.UserProfile.update(current.id, patch);
      }
      setProfile(current);

      // Sensitive contact fields (phone) + full_name sync live on the
      // owner/admin-only UserContact entity, never on the public UserProfile.
      const contactPatch = {};
      if (phoneChanged) contactPatch.phone = phone;
      if (nameChanged) contactPatch.full_name = displayName;
      if (contact?.id && Object.keys(contactPatch).length) {
        const updatedContact = await base44.entities.UserContact.update(contact.id, contactPatch);
        setContact(updatedContact);
      } else if (!contact?.id && Object.keys(contactPatch).length) {
        const newContact = await base44.entities.UserContact.create({
          user_id: user.id,
          ...contactPatch,
          account_status: 'active',
          verification_status: 'unverified',
          registration_source: 'web',
        });
        setContact(newContact);
      }

      toast({ title: isClient ? 'Business profile updated' : 'Profile updated' });
    } catch (e) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const togglePref = async (key, value) => {
    if (!pref) return;
    const prev = pref;
    setPref({ ...pref, [key]: value });
    try {
      const updated = await base44.entities.UserPreference.update(pref.id, { [key]: value });
      setPref(updated);
    } catch (e) {
      setPref(prev);
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  // Master public visibility lives on the public-readable UserProfile (the source
  // visitors read to filter the public profile), not the owner-only UserPreference.
  const toggleProfileVisibility = async (v) => {
    if (!profile?.id) return;
    const prev = profile;
    const val = v ? 'public' : 'private';
    setProfile({ ...profile, profile_visibility: val });
    try {
      const updated = await base44.entities.UserProfile.update(profile.id, { profile_visibility: val });
      setProfile(updated);
    } catch (e) {
      setProfile(prev);
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const toggleNeed = (need) => {
    setCreativeNeeds(prev => prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto space-y-6 pb-8">
      <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Profile
      </Link>
      <h1 className="font-heading text-xl md:text-2xl font-bold tracking-tight">{isClient ? 'Edit business profile' : 'Edit profile'}</h1>

      {/* Identity */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          {isClient ? <Building2 className="w-4 h-4 text-muted-foreground" /> : <AtSign className="w-4 h-4 text-muted-foreground" />}
          <h2 className="font-heading text-base font-semibold">{isClient ? 'Business Identity' : 'Personal Info'}</h2>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-secondary flex items-center justify-center shrink-0">
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : isClient ? <Building2 className="w-6 h-6 text-muted-foreground" /> : <Camera className="w-6 h-6 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{isClient ? 'Business logo' : 'Profile photo'}</p>
            <p className="text-xs text-muted-foreground mb-2">{isClient ? 'Shown on your business page' : 'Shown on your profile & posts'}</p>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-primary cursor-pointer">
              {uploadingAvatar ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</> : 'Change'}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={uploadingAvatar} />
            </label>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="space-y-2">
            <Label>{isClient ? 'Display name' : 'Display name'}</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={isClient ? 'Business contact name' : 'Your name'} className="h-10" />
          </div>
          <div>
            <UsernameInput value={username} onChange={setUsername} displayName={displayName} onStatusChange={setUsernameValid} disabled={!canEditUsername && !!profile?.username} />
            {!canEditUsername && profile?.username && (
              <div className="mt-2 text-xs text-muted-foreground">Next change available: {formatDate(cooldown.nextDate)}</div>
            )}
          </div>
          <div className="space-y-2">
            <Label>{isClient ? 'Short brand description' : 'Bio'}</Label>
            <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder={isClient ? 'One-line about your business' : 'Short bio'} rows={2} />
          </div>
        </div>
      </section>

      {isClient ? (
        <>
          {/* Business Information */}
          <section className="space-y-4">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">Business Information</h2></div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <Label>Company / Brand name</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your business name" className="h-10" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Media, FMCG, Tech" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label>Company size</Label>
                  <Input value={companySize} onChange={e => setCompanySize(e.target.value)} placeholder="e.g. 11-50" className="h-10" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Country / Region</Label>
                  <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. India" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbrand.com" className="h-10" />
                </div>
              </div>
            </div>
          </section>

          {/* About the Business */}
          <section className="space-y-4">
            <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">About the Business</h2></div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <Label>Company description</Label>
                <Textarea value={businessDescription} onChange={e => setBusinessDescription(e.target.value)} placeholder="What does your business do? What are you known for?" rows={4} />
              </div>
            </div>
          </section>

          {/* Creative Needs */}
          <section className="space-y-4">
            <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">Creative Needs</h2></div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-xs text-muted-foreground mb-3">What do you hire creators for? Select all that apply.</p>
              <div className="flex flex-wrap gap-2">
                {CREATIVE_NEEDS.map(need => {
                  const active = creativeNeeds.includes(need);
                  return (
                    <button key={need} type="button" onClick={() => toggleNeed(need)}
                      className={`inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border transition-colors ${active ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/40'}`}>
                      {active && <Check className="w-3.5 h-3.5" />}
                      {need}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="space-y-4">
            <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">Contact</h2></div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <Label>Business email</Label>
                <Input value={user?.email || ''} disabled className="h-10 opacity-60" />
                <p className="text-xs text-muted-foreground">Your account email. Change it in Settings.</p>
              </div>
              <div className="space-y-2">
                <Label>Phone (optional)</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Contact phone" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbrand.com" className="h-10" />
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Professional Info */}
          <section className="space-y-4">
            <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">Professional Info</h2></div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <Label>Professional title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Cinematic Video Editor" className="h-10" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Years of experience</Label>
                  <Input value={experience} onChange={e => setExperience(e.target.value)} placeholder="e.g. 5" className="h-10" />
                </div>
                <div className="space-y-2">
                  <Label>Skills</Label>
                  <Input value={skills} onChange={e => setSkills(e.target.value)} placeholder="Color grading, Motion graphics" className="h-10" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">Comma-separated list of your skills</p>
            </div>
          </section>

          {/* Tools & Expertise */}
          <section className="space-y-4">
            <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">Tools & Expertise</h2></div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <Label>Software / Tools</Label>
                <Input value={tools} onChange={e => setTools(e.target.value)} placeholder="e.g. Premiere Pro, After Effects, DaVinci Resolve" className="h-10" />
                <p className="text-xs text-muted-foreground">Comma-separated software you use</p>
              </div>
              <div className="space-y-2">
                <Label>Creative specialties</Label>
                <Input value={categories} onChange={e => setCategories(e.target.value)} placeholder="e.g. Reels, Music Videos, Weddings" className="h-10" />
                <p className="text-xs text-muted-foreground">Comma-separated categories you work in</p>
              </div>
            </div>
          </section>

          {/* Portfolio */}
          <section className="space-y-4">
            <div className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">Portfolio</h2></div>
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <div className="space-y-2">
                <Label>Portfolio link</Label>
                <Input value={portfolioUrl} onChange={e => setPortfolioUrl(e.target.value)} placeholder="https://yourportfolio.com" className="h-10" />
              </div>
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Featured work</p>
                  <Link to="/winners-hub" className="text-xs text-primary inline-flex items-center gap-1"><PlusCircle className="w-3.5 h-3.5" /> Add work</Link>
                </div>
                {posts.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <ImageIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    No showcased work yet. Share your best edits in Winners Hub.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {posts.map(p => (
                      <Link key={p.id} to={`/community/post/${p.id}`} className="aspect-square rounded-lg overflow-hidden bg-secondary">
                        {p.media_url ? <img src={p.media_url} alt={p.title || ''} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-5 h-5 text-muted-foreground" /></div>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Public Profile */}
      <section className="space-y-4">
        <div className="flex items-center gap-2"><Eye className="w-4 h-4 text-muted-foreground" /><h2 className="font-heading text-base font-semibold">Public Profile</h2></div>
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Public profile</p>
              <p className="text-xs text-muted-foreground">{isClient ? 'Allow others to view your business page' : 'Allow others to view your profile'}</p>
            </div>
            <Switch checked={(profile?.profile_visibility || 'public') !== 'private'} onCheckedChange={(v) => toggleProfileVisibility(v)} />
          </div>
          {!isClient && (
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Show earnings publicly</p>
                <p className="text-xs text-muted-foreground">Display earnings on your public profile</p>
              </div>
              <Switch checked={!!pref?.show_earnings} onCheckedChange={(v) => togglePref('show_earnings', v)} />
            </div>
          )}
        </div>
      </section>

      <Button onClick={handleSave} disabled={saving || !hasChanges || (usernameChanged && !usernameValid)} className="w-full h-11">
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save changes</>}
      </Button>
    </div>
  );
}