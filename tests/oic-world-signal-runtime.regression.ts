import assert from 'node:assert/strict';
import { enrichPublicSignalsWithOic, isOicWorldSignalsEnabled } from '../lib/oic-public-signals';

function testEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

async function run() {
  assert.equal(isOicWorldSignalsEnabled(testEnv()), false);
  assert.equal(isOicWorldSignalsEnabled(testEnv({ WAVEATLAS_OIC_WORLD_SIGNALS: 'true' })), false);
  assert.equal(
    isOicWorldSignalsEnabled(
      testEnv({ WAVEATLAS_OIC_WORLD_SIGNALS: 'true', OIC_BASE_URL: 'https://oic.invalid' }),
    ),
    true,
  );

  const disabled = await enrichPublicSignalsWithOic(
    { layer: 'events', pointCount: 12 },
    testEnv(),
  );
  assert.deepEqual(disabled, { enabled: false, signals: [], degraded: false });

  const unavailable = await enrichPublicSignalsWithOic(
    { layer: 'events', pointCount: 12 },
    testEnv({ WAVEATLAS_OIC_WORLD_SIGNALS: 'true', OIC_BASE_URL: 'http://127.0.0.1:1' }),
  );
  assert.equal(unavailable.enabled, true);
  assert.equal(unavailable.degraded, true);
  assert.deepEqual(unavailable.signals, []);

  console.log('OIC world signal runtime regression passed');
}

void run();
