import { NextResponse, type NextRequest } from "next/server";
import { needsCompatibilityPlayer } from "./lib/embedded-browser";

export function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.get("full") === "1" || !needsCompatibilityPlayer(request.headers.get("user-agent") || "")) return NextResponse.next();
  const target = new URL("/listen", request.url);
  const pathId = /^\/station\/([^/]+)\/?$/.exec(request.nextUrl.pathname)?.[1];
  const id = request.nextUrl.searchParams.get("station") || pathId;
  if (id) target.searchParams.set("station", id);
  return NextResponse.redirect(target, 307);
}

export const config = { matcher: ["/", "/station/:path*"] };
