import { NextResponse } from "next/server";
import { GATE_COOKIE, checkPassword, gateToken } from "@/lib/gate";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  if (!checkPassword(password)) {
    return NextResponse.redirect(new URL("/gate?error=1", request.url), 303);
  }

  // Only allow relative paths, so ?next= cannot bounce anyone off-site.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const response = NextResponse.redirect(new URL(target, request.url), 303);

  response.cookies.set(GATE_COOKIE, await gateToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
