import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { NextRequest } from "next/server";
import { needsCompatibilityPlayer } from "../lib/embedded-browser";
import { compatibilityStream, renderCompatibilityPlayer } from "../lib/compatibility-player";
import { startupStations } from "../lib/startupStations";
import { proxy } from "../proxy";

const classic = readFileSync("public/browser-compatibility.js", "utf8");
const cases: Array<[string, boolean]> = [
  ["Mozilla/5.0 (Linux; Android 5.1) AppleWebKit/537.36 Version/4.0 Chrome/49.0.2623.105 Mobile Safari/537.36", true],
  ["Mozilla/5.0 (Linux; Android 4.0) AppleWebKit/534.30 Version/4.0 Mobile Safari/534.30", true],
  ["Mozilla/5.0 (Linux; Android 13) Chrome/110.0.0.0 Mobile Safari/537.36", true],
  ["Mozilla/5.0 (Linux; Android 13) Chrome/111.0.0.0 Mobile Safari/537.36", false],
  ["Mozilla/5.0 (Linux; Android 14) Chrome/140.0.0.0 Mobile Safari/537.36", false],
  ["Mozilla/5.0 (Android 13) Gecko/140 Firefox/140.0", false],
  ["Mozilla/5.0 (Android 5) Gecko/68 Firefox/68.0", true],
  ["Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0 Safari/537.36", false],
  ["Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1", false],
  ["", false],
];
for (const [ua, expected] of cases) {
  assert.equal(needsCompatibilityPlayer(ua), expected);
  let destination = "";
  runInNewContext(classic, { navigator: { userAgent: ua }, location: { pathname: "/", search: "", replace: (url: string) => { destination = url; } } });
  assert.equal(Boolean(destination), expected, "Cached-page bootstrap must agree with server routing");
  const response = proxy(new NextRequest("https://waveatlas.test/", { headers: { "user-agent": ua } }));
  assert.equal(response.status, expected ? 307 : 200);
}
const old = cases[0][0];
assert.equal(proxy(new NextRequest("https://waveatlas.test/?full=1", { headers: { "user-agent": old } })).status, 200);
const shared = proxy(new NextRequest("https://waveatlas.test/station/abc-12345", { headers: { "user-agent": old } }));
assert.equal(shared.headers.get("location"), "https://waveatlas.test/listen?station=abc-12345");
const station = { ...startupStations[0], name: '<img src=x onerror="alert(1)">', url: "https://radio.test/live.mp3", url_resolved: "javascript:alert(1)" };
assert.equal(compatibilityStream(station), "https://radio.test/live.mp3");
assert.equal(compatibilityStream({ ...station, url: "http://radio.test/live.mp3" }), "");
const html = renderCompatibilityPlayer([station], station, '<script>alert(1)</script>', "NG");
assert.ok(!html.includes("<img src=x"));
assert.ok(!html.includes("<script>alert(1)</script>"));
assert.match(html, /<audio controls preload="none" src="https:\/\/radio.test\/live.mp3"/);
assert.match(html, /<form action="\/listen" method="get">/);
assert.match(html, /<option value="CG">/);
assert.ok(!html.includes("/_next/"), "Player must work without the modern app bundles");
assert.ok(!html.includes("autoplay"));
assert.match(renderCompatibilityPlayer([], undefined, "", "", true), /shared station could not be found/);
console.log("Embedded browser regression passed: routing, modern-browser preservation, station links, safe HTML, native playback and search.");

async function checkServerPlayer() {
  const { GET } = await import("../app/listen/route");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Simulated catalog outage"); };
  try {
    const response = await GET(new Request("https://waveatlas.test/listen?q=Agidigbo&country=NG"));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.match(html, /Agidigbo/);
    assert.ok(!html.includes("/_next/"));
    const stationLink = /href="(\/listen\?station=[^"]+)"/.exec(html)?.[1];
    assert.ok(stationLink, "A cached station must remain selectable during a catalog outage");
    const playback = await GET(new Request("https://waveatlas.test" + stationLink.replace(/&amp;/g, "&")));
    assert.match(await playback.text(), /<audio controls preload="none"/);
    console.log("Server player checks passed: catalog outage fallback, country search, station selection and native audio.");
  } finally { globalThis.fetch = originalFetch; }
}
void checkServerPlayer().catch((error) => { console.error(error); process.exitCode = 1; });
