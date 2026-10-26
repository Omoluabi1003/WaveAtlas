import assert from 'node:assert/strict';
import { enrichPublicSignalsWithOic, isOicWorldSignalsEnabled } from '../lib/oic-public-signals';

async function run() {
  assert.equal(isOicWorldSignalsEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(isOicWorldSignalsEnabled({ WAVEATLAS_OIC_WORLD_SIGNALS: 'true' } as NodeJS.ProcessEnv), false);
  assert.equal(
    isOicWorldSignalsEnabled({ WAVEATLAS_OIC_WORLD_SIGNALS: 'true', OIC_BASE_URL: 'https://oic.invalid' } as NodeJS.ProcessEnv),
    true,
  );

  const disabled = await enrichPublicSignalsWithOic(
    { layer: 'events', pointCount: 12 },
    {} as NodeJS.ProcessEnv,
  );
  assert.deepEqual(disabled, { enabled: false, signals: [], degraded: false });

  const unavailable = await enrichPublicSignalsWithOic(
    { layer: 'events', pointCount: 12 },
    { WAVEATLAS_OIC_WORLD_SIGNALS: 'true', OIC_BASE_URL: 'http://127.0.0.1:1' } as NodeJS.ProcessEnv,
  );
  assert.equal(unavailable.enabled, true);
  assert.equal(unavailable.degraded, true);
  assert.deepEqual(unavailable.signals, []);

  console.log('OIC world signal runtime regression passed');
}

void run();
