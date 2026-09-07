import { useCallback, useEffect, useRef, useState } from 'react';

// Submission draft autosave — never lose form state to navigation.
// Uploaded assets persist too: uploads go to private storage immediately,
// so the draft stores their file_uri and restores fully on return.

const KEY = (contestId, userId) => `rk-sub-draft-${contestId}-${userId}`;

export function useSubmissionDraft(contestId, userId) {
  const [draft, setDraft] = useState(null); // null = not yet loaded
  const [savedAt, setSavedAt] = useState(null);
  const [restored, setRestored] = useState(false);
  const loadedKey = useRef(null);

  // Load once both ids are known.
  useEffect(() => {
    if (!contestId || !userId) return;
    const key = KEY(contestId, userId);
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      setDraft(parsed || {});
      const hasContent =
        parsed && (parsed.final || (parsed.platforms || []).length || (parsed.sourceFiles || []).length || parsed.notes);
      setRestored(Boolean(hasContent));
    } catch {
      setDraft({});
    }
  }, [contestId, userId]);

  // Debounced persist whenever the draft changes (after initial load).
  useEffect(() => {
    if (!draft || !contestId || !userId) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY(contestId, userId), JSON.stringify(draft));
        setSavedAt(Date.now());
      } catch { /* storage full — non-fatal */ }
    }, 600);
    return () => clearTimeout(t);
  }, [draft, contestId, userId]);

  const updateDraft = useCallback((patch) => {
    setDraft((d) => ({ ...(d || {}), ...patch }));
  }, []);

  const clearDraft = useCallback(() => {
    if (contestId && userId) {
      try { localStorage.removeItem(KEY(contestId, userId)); } catch { /* noop */ }
    }
    setSavedAt(null);
    setRestored(false);
  }, [contestId, userId]);

  return { draft, updateDraft, clearDraft, savedAt, restored, ready: draft !== null };
}