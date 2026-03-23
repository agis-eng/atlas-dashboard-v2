import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        id: session.userId,
        name: session.name,
        email: session.email,
        profile: session.profile,
      },
    });
  } catch (err) {
    console.error("[auth/me]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
