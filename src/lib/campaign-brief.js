// Constants, helpers and validation for the campaign brief (Create Contest).

export const PLATFORM_FEE_RATE = 0.1;
export const GST_RATE = 0.18; // GST charged on the platform fee (India)
export const STATUTORY_DEDUCTION_RATE = 0.1; // display-only estimate of creator TDS (u/s 194J)

export const CATEGORIES = ['Instagram Reel', 'YouTube Shorts', 'YouTube Video', 'Advertisement', 'Gaming', 'Wedding', 'Documentary', 'Corporate', 'Travel', 'Music Video'];

export const CONTEST_TYPES = ['Video Editing', 'Short-form Content', 'Long-form Content', 'Motion Graphics', 'Advertisement', 'Music Video', 'Animation', 'Other'];

export const RESOURCE_TYPES = ['Reference', 'Footage', 'Source Material', 'Brand Asset', 'Brand Guidelines', 'Inspiration', 'Product Information', 'Music/Audio', 'Document', 'Other'];

export const RESOURCE_PERMISSIONS = ['Creator May Use', 'Reference Only', 'Required', 'Do Not Redistribute', 'Use Only For This Contest'];

export const RESOURCE_FILTERS = ['All', 'References', 'Footage', 'Brand Assets', 'Guidelines', 'Inspiration', 'Documents', 'Other'];

export const RESOURCE_TYPE_GROUPS = {
  References: ['Reference', 'Product Information'],
  Footage: ['Footage', 'Source Material', 'Music/Audio'],
  'Brand Assets': ['Brand Asset'],
  Guidelines: ['Brand Guidelines'],
  Inspiration: ['Inspiration'],
  Documents: ['Document'],
  Other: ['Other'],
};

export const CONTENT_TYPES = ['Video', 'Image', 'Audio', 'Motion Graphics', 'Thumbnail', 'Document', 'Other'];
export const PLATFORMS = ['Instagram', 'YouTube', 'TikTok', 'Facebook', 'LinkedIn', 'Website', 'Other'];
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5', '4:3', '21:9'];
export const RESOLUTIONS = ['480p', '720p', '1080p', '2K', '4K'];

export const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'];

export const FIXED_REQUIREMENTS = [
  'Submit only original work created for this contest',
  'Submit before the deadline — late entries are not accepted',
  'Follow the required file format and specifications',
  'Respect platform content policies',
  'No copyright-infringing material',
  'Include all required files in your submission',
  'Follow the campaign brief and deliverable instructions',
];

export const BRIEF_PROMPTS = [
  { label: 'Goal', text: '## Goal\n' },
  { label: 'Audience', text: '## Audience\n' },
  { label: 'Creative Direction', text: '## Creative Direction\n' },
  { label: 'Must Include', text: '## Must Include\n' },
  { label: 'Must Avoid', text: '## Must Avoid\n' },
  { label: 'Tone & Style', text: '## Tone & Style\n' },
  { label: 'Key Message', text: '## Key Message\n' },
];

export const SECTIONS = [
  { id: 'sec-basic', number: 1, title: 'Basic Information', subtitle: 'Title, category and cover' },
  { id: 'sec-brief', number: 2, title: 'Campaign Brief', subtitle: 'Write the full creative brief' },
  { id: 'sec-resources', number: 3, title: 'Reference & Resources', subtitle: 'Links, files and brand assets' },
  { id: 'sec-deliverables', number: 4, title: 'Deliverables', subtitle: 'What creators must submit' },
  { id: 'sec-requirements', number: 5, title: 'Submission Requirements', subtitle: 'Fixed platform rules + your own' },
  { id: 'sec-awards', number: 6, title: 'Award & Rewards', subtitle: 'Award pool and winner distribution' },
  { id: 'sec-participation', number: 7, title: 'Participation', subtitle: 'Who can join and how often' },
  { id: 'sec-timeline', number: 8, title: 'Timeline', subtitle: 'Start, deadline and timezone' },
];

export const parseJSON = (str, fallback = []) => {
  try { const v = JSON.parse(str); return v ?? fallback; } catch { return fallback; }
};

export const emptyResource = () => ({ id: crypto.randomUUID(), type: 'Reference', title: '', kind: 'link', url: '', file_url: '', file_name: '', description: '', usage_instructions: '', permission: 'Creator May Use' });

export const emptyDeliverable = () => ({ id: crypto.randomUUID(), name: '', content_type: 'Video', platform: 'Instagram', duration: '', aspect_ratio: '9:16', resolution: '1080p', file_format: '', quantity: 1, instructions: '' });

export function briefHasText(html) {
  if (!html) return false;
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim().length > 0;
}

export function platformFee(pool) {
  return Math.round((Number(pool) || 0) * PLATFORM_FEE_RATE);
}

// Display-only fee breakdown helpers (India · INR). Nothing is charged or moved here.
export function gstOnFee(pool) {
  return Math.round(platformFee(pool) * GST_RATE);
}

export function statutoryDeduction(pool) {
  return Math.round((Number(pool) || 0) * STATUTORY_DEDUCTION_RATE);
}

export function creatorReceives(pool) {
  const p = Number(pool) || 0;
  return p - platformFee(p) - statutoryDeduction(p);
}

export function computeDistribution(pool, winners) {
  const p = Math.max(0, Math.round(Number(pool) || 0));
  const n = Math.max(1, Math.min(10, Math.round(Number(winners) || 1)));
  const base = Math.floor(p / n);
  let rem = p - base * n;
  return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}

export function positionsJSON(amounts) {
  return JSON.stringify(amounts.map((amount, i) => ({ position: i + 1, amount })));
}

export function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function formatMoney(n) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
}

export function validateBrief(data, availableFunds) {
  const warnings = [];
  const resources = parseJSON(data.resources);
  const deliverables = parseJSON(data.deliverables);
  const customReqs = parseJSON(data.custom_requirements);
  const positions = parseJSON(data.prize_positions);
  const pool = Number(data.prize_amount) || 0;
  const total = pool + platformFee(pool);

  if (!data.title?.trim()) warnings.push({ section: 1, message: 'Add a contest title' });
  if (!data.category) warnings.push({ section: 1, message: 'Choose a category' });
  if (!data.contest_type) warnings.push({ section: 1, message: 'Choose a contest type' });
  if (!data.short_description?.trim()) warnings.push({ section: 1, message: 'Write a short description' });
  if (!briefHasText(data.brief)) warnings.push({ section: 2, message: 'Write the campaign brief' });
  if (deliverables.length === 0) warnings.push({ section: 4, message: 'Add at least one deliverable' });
  if (pool <= 0) warnings.push({ section: 6, message: 'Set the total award pool' });
  const distSum = positions.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (pool > 0 && positions.length === 0) warnings.push({ section: 6, message: 'Distribute the award across winner positions' });
  if (pool > 0 && positions.length > 0 && distSum !== pool) warnings.push({ section: 6, message: `Award distribution (${formatMoney(distSum)}) must equal the award pool (${formatMoney(pool)})` });
  if (!data.deadline) warnings.push({ section: 8, message: 'Set the submission deadline' });
  if (data.deadline && data.start_date && new Date(`${data.start_date}T${data.start_time || '00:00'}`) >= new Date(data.deadline)) {
    warnings.push({ section: 8, message: 'Start date must be before the submission deadline' });
  }
  if (availableFunds < total) warnings.push({ section: 6, message: 'Insufficient wallet balance — add money to launch' });

  const distOk = pool > 0 && positions.length > 0 && distSum === pool;
  const timelineOk = !!data.deadline && !(data.deadline && data.start_date && new Date(`${data.start_date}T${data.start_time || '00:00'}`) >= new Date(data.deadline));
  const sectionDone = {
    1: !!(data.title?.trim() && data.category && data.contest_type && data.short_description?.trim()),
    2: briefHasText(data.brief),
    3: resources.length > 0,
    4: deliverables.length > 0,
    5: customReqs.length > 0,
    6: distOk,
    7: true,
    8: timelineOk,
  };
  return { warnings, sectionDone };
}

export function buildContestPayload(data, status) {
  const resources = parseJSON(data.resources);
  const customReqs = parseJSON(data.custom_requirements);
  const footage = resources.find((r) => (r.type === 'Footage' || r.type === 'Source Material') && r.kind === 'link' && r.url?.includes('drive.google.com'));
  return {
    title: data.title,
    description: data.short_description,
    short_description: data.short_description,
    contest_type: data.contest_type,
    cover_image_url: data.cover_image_url,
    brief: data.brief,
    resources: data.resources,
    deliverables: data.deliverables,
    custom_requirements: data.custom_requirements,
    category: data.category,
    editing_style: data.editing_style || '',
    preferred_software: data.preferred_software || 'Any',
    contest_rules: [...FIXED_REQUIREMENTS, ...customReqs.map((r) => r.text)].join('\n'),
    prize_amount: data.prize_amount || 0,
    platform_fee: platformFee(data.prize_amount),
    settlement_region: data.settlement_region || 'IN',
    currency: data.currency || 'INR',
    number_of_winners: data.number_of_winners || 1,
    prize_positions: data.prize_positions,
    post_winner_action: data.post_winner_action || 'NONE',
    handover_required: data.post_winner_action === 'ACCOUNT_HANDOVER' ? true : !!data.handover_required,
    handover_type: data.handover_type || '',
    account_property_type: data.account_property_type || '',
    handover_notes: data.handover_notes || '',
    handover_deadline: data.handover_deadline || '',
    collaboration_type: data.collaboration_type || '',
    collaboration_duration: data.collaboration_duration || '',
    collaboration_responsibilities: data.collaboration_responsibilities || '',
    collaboration_notes: data.collaboration_notes || '',
    additional_compensation: data.additional_compensation || '',
    collaboration_communication: data.collaboration_communication || '',
    submission_limit: data.submission_limit || 0,
    deadline: data.deadline,
    start_date: data.start_date,
    start_time: data.start_time,
    timezone: data.timezone || 'UTC',
    verified_creators_only: !!data.verified_creators_only,
    private_contest: !!data.private_contest,
  
    reference_links: resources.filter((r) => r.kind === 'link' && r.url).map((r) => r.url).join('\n'),
    additional_notes: '',
    drive_link: footage?.url || '',
    drive_link_valid: !!footage,
    auto_hide_drive_link: true,
    allow_one_access: false,
    disable_reaccess_after_submission: false,
    require_otp: false,
    manual_approval: false,
    max_downloads: 1,
    drive_link_removed: false,
    status,
    contest_id: data.contest_id,
  };
}