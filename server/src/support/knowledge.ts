// @ts-nocheck
// Verified RazeKit knowledge base.
//
// Every answer here describes behaviour that is ACTUALLY IMPLEMENTED in this
// codebase (scoring engine, duration rules, traffic verification, winner
// finalization). The support assistant answers only from this file, so it
// cannot invent platform behaviour, payment state or fraud reasoning.
//
// Deliberately absent: anti-fraud thresholds, detection formulas, internal
// risk states, secrets. Those must never reach a user (spec 16/37).

import { GLOBAL_MAX_DAYS, PRIZE_TIERS } from '../contest/duration.js';

const tierText = PRIZE_TIERS
  .map((t) => `${t.label}: ${t.minDays}–${t.maxDays} days`)
  .join('; ');

export const KNOWLEDGE = [
  {
    topic: 'how_contests_work',
    question: 'How do contests work?',
    keywords: ['how', 'contest', 'work', 'lifecycle', 'process', 'start', 'begin'],
    answer:
      'A brand publishes a prize-funded brief. Creators discover it, join, produce the work and submit it. ' +
      'Performance is then measured, the winner is finalized by the RazeKit scoring engine, and the result becomes official.',
    related: ['scoring', 'duration'],
  },
  {
    topic: 'scoring',
    question: 'How is the winner decided?',
    keywords: ['winner', 'score', 'scoring', 'decide', 'chosen', 'final score', 'who wins', 'judged', 'judging'],
    answer:
      'Final Score = 50% Video Engagement + 50% Brand Traffic, each normalized to 0–100. ' +
      'The highest Final Score wins. If two entries tie, the higher Brand Traffic score wins, then the higher Video Engagement score, ' +
      'then the earlier submission — the tie-break is deterministic, never random.',
    related: ['engagement', 'traffic'],
  },
  {
    topic: 'engagement',
    question: 'What is Video Engagement?',
    keywords: ['video engagement', 'engagement', 'views', 'likes', 'comments', 'shares', 'saves', 'followers'],
    answer:
      'Video Engagement measures the overall performance of your creative work across supported engagement signals — ' +
      'views, likes, comments, shares, saves, watch time and follower growth. These are inputs to one normalized 0–100 score. ' +
      'No single signal wins on its own: followers, views, likes and comments do not independently determine the winner.',
    related: ['scoring'],
  },
  {
    topic: 'traffic',
    question: 'What is Brand Traffic?',
    keywords: ['brand traffic', 'traffic', 'clicks', 'visitors', 'link', 'tracking link', 'referral'],
    answer:
      'Brand Traffic measures verified people who actually reached the brand because of your work. ' +
      'You get a tracked campaign link for your submission; verified visits through that link count toward your Brand Traffic score. ' +
      'A video view is not a visit — they are measured separately.',
    related: ['scoring', 'excluded_traffic'],
  },
  {
    topic: 'excluded_traffic',
    question: 'Why was some of my traffic excluded?',
    keywords: ['excluded', 'not counted', 'suspicious', 'verified', 'why', 'missing clicks', 'fraud'],
    answer:
      'Activity that cannot be verified may be excluded from performance calculations. ' +
      'This protects every creator equally, so that genuine work is not out-competed by activity that is not real. ' +
      'Your Tracker shows how many visits were verified and how many were excluded.',
    escalate: true,
    related: ['traffic'],
  },
  {
    topic: 'duration',
    question: 'How long can a contest run?',
    keywords: ['duration', 'how long', 'days', 'deadline', 'timeline', 'prize tier', 'time'],
    answer:
      `RazeKit sets the allowed contest duration from the prize value, so timelines stay fair and predictable: ${tierText}. ` +
      `No contest may run longer than ${GLOBAL_MAX_DAYS} days. The rule is enforced by the server, so it applies to every contest.`,
    related: ['how_contests_work'],
  },
  {
    topic: 'provisional_score',
    question: 'Why is my score provisional?',
    keywords: ['provisional', 'not final', 'still calculating', 'pending score', 'delayed', 'analytics'],
    answer:
      'A provisional score means some performance signals are still arriving, so the number can still change. ' +
      'Once a contest is finalized the score is locked and preserved with its scoring version, so historical results stay reproducible.',
    related: ['scoring'],
  },
  {
    topic: 'tracker',
    question: 'What is the Tracker?',
    keywords: ['tracker', 'performance', 'analytics', 'dashboard', 'stats'],
    answer:
      'Tracker is your performance intelligence view. Creators see contests joined, scores, verified traffic, wins and earnings. ' +
      'Brands see campaign performance, participating creators, submissions and verified brand traffic. ' +
      'You only ever see your own data.',
    related: ['scoring', 'traffic'],
  },
  {
    topic: 'submitting',
    question: 'How do I submit my work?',
    keywords: ['submit', 'submission', 'enter', 'join', 'upload', 'participate'],
    answer:
      'Open a contest from Discover, join it, then submit your work before the deadline. ' +
      'After submitting you can request a tracked campaign link so your Brand Traffic can be measured.',
    related: ['traffic', 'how_contests_work'],
  },
  {
    topic: 'payments',
    question: 'How do payments and prizes work?',
    keywords: ['payment', 'pay', 'prize', 'payout', 'money', 'earnings', 'withdraw', 'paid'],
    answer:
      'Prize funding and winner payouts are currently handled off-platform, and your Tracker shows the prize value of contests you have won. ' +
      'For anything specific to your own payment or payout, a RazeKit team member should check it for you.',
    escalate: true,
    related: ['scoring'],
  },
  {
    topic: 'winners_hub',
    question: 'What is the Winners page?',
    keywords: ['winners', 'leaderboard', 'showcase', 'published', 'hall'],
    answer:
      'Winners showcases officially finalized winning work along with the brand, contest, prize and result. ' +
      'The leaderboard ranks creators using the same RazeKit scoring system — never by follower count or popularity.',
    related: ['scoring'],
  },
  {
    topic: 'roles',
    question: 'What is the difference between a creator and a brand account?',
    keywords: ['role', 'creator', 'brand', 'client', 'account type', 'switch'],
    answer:
      'A creator joins contests and submits work. A brand publishes prize-funded contests and reviews submissions. ' +
      'You choose your account type when you join. Changing it afterwards needs RazeKit support.',
    escalate: true,
  },
];

/**
 * Deterministic keyword match. Returns the best entry, or null when nothing
 * clears the confidence bar — the caller then answers "I don't have verified
 * information about that yet" rather than guessing.
 */
export function searchKnowledge(question) {
  const q = String(question || '').toLowerCase();
  if (!q) return null;

  let best = null;
  let bestScore = 0;
  for (const entry of KNOWLEDGE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += kw.includes(' ') ? 3 : 1; // phrases weigh more
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  // Require a real signal, not a single incidental word like "how".
  return bestScore >= 2 ? best : null;
}
