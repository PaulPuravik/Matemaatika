import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { GATE_COOKIE, isValidGateToken } from "@/lib/gate";

/** Paths reachable without passing the shared password gate. */
const PUBLIC_PATHS = ["/gate", "/api/gate"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const passed = await isValidGateToken(request.cookies.get(GATE_COOKIE)?.value);
    if (!passed) {
      const url = request.nextUrl.clone();
      url.pathname = "/gate";
      url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  // Past the gate: refresh the Supabase session so server components see a
  // current token. This must return the same response object the cookies
  // were written onto.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
