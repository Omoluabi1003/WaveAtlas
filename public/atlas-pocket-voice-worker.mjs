/*
 * Atlas Voice Engine 2.0
 *
 * Deliberately isolated from the production AtlasAssistant runtime.
 * The worker imports the MIT-licensed clone-voice SDK, which uses Pocket TTS
 * and ONNX Runtime. Keeping inference in a dedicated worker prevents model
 * execution from blocking WaveAtlas' main UI thread on supported browsers.
 *
 * Pinned version. Do not change without repeating mobile memory tests.
 */
import 'https://cdn.jsdelivr.net/npm/clone-voice@0.2.2/dist/worker.mjs';
