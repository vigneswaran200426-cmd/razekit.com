import React from "react";

export const PLATFORM_FEE_RATE = 0.10; // 10%

export function formatINR(amount) {
  if (amount == null || isNaN(amount)) return "₹0";
  return "₹" + Number(amount).toLocaleString("en-IN");
}

export function calcPlatformFee(prize) {
  return Math.round((Number(prize) || 0) * PLATFORM_FEE_RATE);
}

export function calcTotalCost(prize) {
  return (Number(prize) || 0) + calcPlatformFee(prize);
}

export function generateContestId() {
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `CTST-${ts}${rand}`;
}

export const CATEGORIES = [
  "Instagram Reel", "YouTube Shorts", "YouTube Video", "Advertisement", "Gaming",
  "Wedding", "Documentary", "Corporate", "Travel", "Music Video"
];

export const EDITING_STYLES = [
  "Cinematic", "Fast Pace", "Minimal", "Storytelling", "Luxury",
  "Commercial", "Viral", "Vlog", "Gaming", "Custom"
];

export const VIDEO_DURATIONS = [
  "15 Seconds", "30 Seconds", "45 Seconds", "60 Seconds", "90 Seconds",
  "3 Minutes", "5 Minutes", "10 Minutes", "Custom"
];

export const DEADLINE_OPTIONS = [
  { label: "6 Hours", hours: 6 },
  { label: "12 Hours", hours: 12 },
  { label: "24 Hours", hours: 24 },
  { label: "2 Days", hours: 48 },
  { label: "3 Days", hours: 72 },
  { label: "5 Days", hours: 120 },
  { label: "7 Days", hours: 168 },
];

export const SOFTWARE_OPTIONS = [
  "Any Software", "CapCut", "Premiere Pro", "After Effects",
  "DaVinci Resolve", "Final Cut Pro", "VN", "Alight Motion"
];

export function isValidGoogleDriveLink(url) {
  if (!url) return false;
  const patterns = [
    /drive\.google\.com\/file\/d\//i,
    /drive\.google\.com\/drive\/folders\//i,
    /drive\.google\.com\/open\?id=/i,
    /docs\.google\.com\//i,
  ];
  return patterns.some((p) => p.test(url));
}

// Presentation-only: maps a contest's status + deadline urgency to a semantic chip.
export function getWorkStatus(contest) {
  const status = contest?.status;
  if (status === 'draft') return { label: 'Draft', tone: 'muted' };
  if (status === 'paused') return { label: 'Paused', tone: 'muted' };
  if (['winner_selected', 'completed'].includes(status)) return { label: 'Completed', tone: 'success' };
  if (status === 'shortlisted') return { label: 'Shortlisted', tone: 'accent' };
  if (['submitted', 'reviewing'].includes(status)) return { label: 'Under Review', tone: 'accent' };
  if (['open', 'joined', 'working'].includes(status)) {
    const hoursLeft = (new Date(contest?.deadline).getTime() - Date.now()) / 3600000;
    if (hoursLeft > 0 && hoursLeft <= 24) return { label: 'Ending Soon', tone: 'warning' };
    return { label: 'Active', tone: 'primary' };
  }
  return { label: 'Closed', tone: 'muted' };
}