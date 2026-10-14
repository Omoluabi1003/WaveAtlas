import { NextResponse, type NextRequest } from "next/server";
import { stationIdFromUrl } from "./lib/station-deep-link";
import { needsCompatibilityPlayer } from "./lib/embedded-browser";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/ops" || request.nextUrl.pathname.startsWith("/ops/")) {
    const user = process.env.WAVEATLAS_OPS_USERNAME, password = process.env.WAVEATLAS_OPS_PASSWORD;
    if (!user || !password) return new NextResponse("Operations access is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
    const expected = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
    if (request.headers.get("authorization") !== expected) return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="WaveAtlas Operations", charset="UTF-8"', "Cache-Control": "no-store" } });
    const response = NextResponse.next(); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("X-Robots-Tag", "noindex, nofollow"); return response;
  }
  if (request.nextUrl.pathname !== "/" && !/^\/station\/[^/]+\/?$/.test(request.nextUrl.pathname)) return NextResponse.next();
  if (request.nextUrl.searchParams.get("full") === "1" || !needsCompatibilityPlayer(request.headers.get("user-agent") || "")) return NextResponse.next();
  const target = new URL("/listen", request.url);
  const id = stationIdFromUrl(request.nextUrl);
  if (id) target.searchParams.set("station", id);
  return NextResponse.redirect(target, 307);
}

export const config = { matcher: ["/", "/station/:path*", "/ops/:path*"] };
