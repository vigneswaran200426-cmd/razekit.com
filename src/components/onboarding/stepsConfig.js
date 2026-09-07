export const CLIENT_STEPS = [
  {
    title: 'Basic',
    subtitle: 'Tell us about you',
    fields: [
      { key: 'full_name', label: 'Full name', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'tel', required: true },
      { key: 'country', label: 'Country / Region', type: 'text', required: true },
    ],
  },
  {
    title: 'Business',
    subtitle: 'Your business details',
    fields: [
      { key: 'company_name', label: 'Company / Brand name', type: 'text', required: true },
      { key: 'industry', label: 'Industry', type: 'text', required: true },
      { key: 'website', label: 'Website (optional)', type: 'url' },
      { key: 'company_size', label: 'Company size (optional)', type: 'text' },
      { key: 'business_description', label: 'Short business description', type: 'textarea', required: true },
    ],
  },
  {
    title: 'Platform usage',
    subtitle: 'What will you post?',
    fields: [
      {
        key: 'categories',
        label: 'What type of creative work do you plan to post?',
        type: 'chips',
        required: true,
        options: ['Video Editing', 'Motion Graphics', 'Graphic Design', 'Animation', 'UI/UX', 'Other'],
      },
    ],
  },
  {
    title: 'Profile',
    subtitle: 'Your public profile',
    fields: [
      { key: 'avatar_url', label: 'Photo / Company logo', type: 'image' },
      { key: 'bio', label: 'Short description', type: 'textarea' },
    ],
  },
];

export const CREATOR_STEPS = [
  {
    title: 'Basic',
    subtitle: 'Tell us about you',
    fields: [
      { key: 'full_name', label: 'Full name', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'tel', required: true },
      { key: 'country', label: 'Country / Region', type: 'text', required: true },
    ],
  },
  {
    title: 'Professional',
    subtitle: 'Your professional identity',
    fields: [
      { key: 'display_name', label: 'Display name', type: 'text', required: true },
      { key: 'professional_title', label: 'Professional title', type: 'text', required: true },
      { key: 'bio', label: 'Bio', type: 'textarea', required: true },
      { key: 'years_experience', label: 'Years of experience', type: 'text', required: true },
    ],
  },
  {
    title: 'Skills',
    subtitle: 'What are you great at?',
    fields: [
      {
        key: 'skills',
        label: 'Skills',
        type: 'chips',
        required: true,
        options: ['Video Editing', 'Motion Graphics', 'Animation', 'Graphic Design', 'UI/UX', 'Thumbnail Design', 'AI Content', 'Other'],
      },
    ],
  },
  {
    title: 'Tools',
    subtitle: 'Software you use',
    fields: [
      {
        key: 'tools',
        label: 'Tools',
        type: 'chips',
        required: true,
        options: ['Premiere Pro', 'After Effects', 'DaVinci Resolve', 'Blender', 'Photoshop', 'Illustrator', 'Figma', 'Other'],
      },
    ],
  },
  {
    title: 'Portfolio',
    subtitle: 'Show your work (optional)',
    fields: [
      { key: 'portfolio_url', label: 'Portfolio URL / website / showreel', type: 'url' },
    ],
  },
  {
    title: 'Profile',
    subtitle: 'Your public profile',
    fields: [
      { key: 'avatar_url', label: 'Photo', type: 'image' },
    ],
  },
];