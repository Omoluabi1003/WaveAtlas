/*
 * RETIRED: Atlas Voice Engine 1.0 / Chatterbox browser worker.
 *
 * This endpoint intentionally performs no model loading. The previous
 * implementation could allocate a very large Chatterbox model in mobile
 * Safari and make the page unresponsive. Keep the path alive so stale tabs
 * fail safely instead of reloading the old model.
 *
 * Voice Engine 2.0 lives at /atlas-voice-clone.html and uses
 * /atlas-pocket-voice-worker.mjs.
 */
self.addEventListener('message', () => {
  self.postMessage({
    type: 'error',
    message: 'Atlas Voice Engine 1.0 was retired for mobile stability. Reload the Voice Lab to use Voice Engine 2.0.',
  });
});
