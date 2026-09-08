// @ts-nocheck
// Replaces the Base44 workflows:
//   • Visual Assets Maintenance → every 6 hours
//   • Contest Visual Assets     → on Contest create (see onContestCreated hook)
// (Money reconciliation was removed along with the payment gateways.)
import cron from 'node-cron';
import { config } from './config.js';
import { visualAssetWorker } from './functions/visual.js';
import { serviceClient } from './entities/service.js';

export function startScheduler() {
  if (!config.enableScheduler) {
    console.log('[scheduler] disabled (ENABLE_SCHEDULER=false)');
    return;
  }

  // Visual assets maintenance every 6 hours.
  cron.schedule('0 */6 * * *', async () => {
    try {
      await visualAssetWorker({ svc: serviceClient(), body: { mode: 'maintain' } });
      console.log('[scheduler] visual assets maintenance done');
    } catch (e) {
      console.error('[scheduler] visual maintenance failed', e);
    }
  });

  console.log('[scheduler] started (visual maintenance every 6h)');
}

// Event hook: called after a Contest is created (see entity create side-effects).
export async function onContestCreated(contestId) {
  try {
    await visualAssetWorker({
      svc: serviceClient(),
      body: { mode: 'ensure', entity_type: 'CONTEST', entity_id: contestId, asset_types: ['CONTEST_THUMBNAIL'], origin: 'auto' },
    });
  } catch (e) {
    console.error('[hook] onContestCreated failed', e);
  }
}
