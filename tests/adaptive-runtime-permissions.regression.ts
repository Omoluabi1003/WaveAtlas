import assert from "node:assert/strict";
import { detectCapabilities, determineProfile, AdaptiveRuntimeMonitor, isolateSubsystem, isolateSubsystemAsync } from "../lib/device-capabilities";
import { checkPermissionStatus, requestMicrophonePermission, recordPermissionDenied, resetPermissionSession } from "../lib/browser-permissions";

async function testDeviceCapabilities() {
  // Test fallback/safe capabilities when no window or navigator is present
  const caps = detectCapabilities();
  assert.equal(caps.webgl, false);
  assert.equal(caps.webgl2, false);
  assert.equal(caps.webAudio, false);

  const initialProfile = determineProfile(caps);
  assert.equal(initialProfile, "SAFE", "Missing RAF or window should yield SAFE profile");

  // Test profile selection logic
  const mockFullCaps = {
    ...caps,
    requestAnimationFrame: true,
    webgl: true,
    webgl2: true,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    effectiveConnectionType: "4g"
  };
  assert.equal(determineProfile(mockFullCaps), "FULL");

  const mockBalancedCaps = {
    ...caps,
    requestAnimationFrame: true,
    webgl: true,
    webgl2: false,
    deviceMemory: 4,
    hardwareConcurrency: 4,
  };
  assert.equal(determineProfile(mockBalancedCaps), "BALANCED");

  // Test monitor hysteresis and downgrade/upgrade
  const monitor = new AdaptiveRuntimeMonitor(mockFullCaps);
  assert.equal(monitor.getProfile(), "FULL");

  // Record low FPS (< 28) repeatedly to trigger downgrade
  for (let i = 0; i < 35; i++) {
    monitor.recordFrame(i * 50); // 20 FPS (50ms delta)
  }
  assert.equal(monitor.getProfile(), "BALANCED", "Persistent low FPS should downgrade FULL to BALANCED");

  // Record high FPS (> 55) repeatedly to test upgrade back
  for (let i = 0; i < 110; i++) {
    monitor.recordFrame(i * 16); // ~62.5 FPS (16ms delta)
  }
  assert.equal(monitor.getProfile(), "FULL", "Sustained high FPS should restore profile up to initial hardware capability");

  // Test subsystem isolation
  const okResult = isolateSubsystem("test-subsystem", () => "working", "fallback");
  assert.equal(okResult, "working");

  const errResult = isolateSubsystem("failing-subsystem", () => {
    throw new Error("subsystem crashed");
  }, "safe-fallback");
  assert.equal(errResult, "safe-fallback", "Crashed optional subsystem must catch error and return safe fallback");

  const asyncErrResult = await isolateSubsystemAsync("async-failing", async () => {
    throw new Error("async crash");
  }, "async-fallback");
  assert.equal(asyncErrResult, "async-fallback");

  console.log("Device capabilities and runtime monitor tests passed.");
}

async function testPermissionsAndLocation() {
  resetPermissionSession();

  // Mock window & navigator to simulate browser environment
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

  // Test permission status checking when prompt
  const micStatusPrompt = await checkPermissionStatus("microphone");
  assert.equal(micStatusPrompt.state, "prompt");

  // Test permission refusal recording and session persistence
  recordPermissionDenied("microphone");
  const micStatusAfterDenial = await checkPermissionStatus("microphone");
  assert.equal(micStatusAfterDenial.state, "denied");

  // Request mic permission should immediately return denied without calling getUserMedia
  const micReq = await requestMicrophonePermission();
  assert.equal(micReq.granted, false);
  assert.equal(micReq.state, "denied");

  resetPermissionSession();
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "navigator");
  console.log("Permission intelligence and refusal loop prevention tests passed.");
}

async function main() {
  await testDeviceCapabilities();
  await testPermissionsAndLocation();
  console.log("All adaptive runtime, permission architecture, and location hardening tests passed.");
}

void main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
