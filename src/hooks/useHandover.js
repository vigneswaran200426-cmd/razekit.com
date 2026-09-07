import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getHandover } from '@/lib/handover-utils';

// Shared data + access control for every handover screen.
// The handover room is strictly two-party: the contest client and the winning creator.
export function useHandover(contestId) {
  const [state, setState] = useState({ loading: true, contest: null, handover: null, user: null });

  const refresh = useCallback(async () => {
    try {
      const [contest, user] = await Promise.all([
        base44.entities.Contest.get(contestId),
        base44.auth.me().catch(() => null),
      ]);
      const handover = await getHandover(contestId).catch(() => null);
      setState({ loading: false, contest, handover, user });
    } catch (e) {
      setState({ loading: false, contest: null, handover: null, user: null });
    }
  }, [contestId]);

  useEffect(() => { refresh(); }, [refresh]);

  const { contest, handover, user } = state;
  const isClient = !!(user && contest && user.id === contest.created_by_id);
  const isWinner = !!(user && contest && contest.winner_user_id && user.id === contest.winner_user_id);
  const isAdmin = user?.role === 'admin';

  return { ...state, isClient, isWinner, authorized: isClient || isWinner || isAdmin, refresh };
}