import { NextResponse, type NextRequest } from "next/server";
import { stationIdFromUrl } from "./lib/station-deep-link";
import { needsCompatibilityPlayer } from "./lib/embedded-browser";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/" && !/^\/station\/[^/]+\/?$/.test(request.nextUrl.pathname)) return NextResponse.next();
  if (request.nextUrl.searchParams.get("full") === "1" || !needsCompatibilityPlayer(request.headers.get("user-agent") || "")) return NextResponse.next();
  const target = new URL("/listen", request.url);
  const id = stationIdFromUrl(request.nextUrl);
  if (id) target.searchParams.set("station", id);
  return NextResponse.redirect(target, 307);
}

export const config = { matcher: ["/", "/station/:path*"] };
