import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/auth";
import { createSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, profile } = body;

    if (!email || !password || !name || !profile) {
      return NextResponse.json(
        { error: "email, password, name, and profile are required" },
        { status: 400 }
      );
    }

    if (!["erik", "anton"].includes(profile)) {
      return NextResponse.json(
        { error: "profile must be 'erik' or 'anton'" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const user = await createUser({ email, password, name, profile });

    await createSession({
      userId: user.id,
      sessionId: "",
      name: user.name,
      email: user.email,
      profile: user.profile,
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profile: user.profile,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const isConflict = message.includes("already exists");
    return NextResponse.json(
      { error: message },
      { status: isConflict ? 409 : 500 }
    );
  }
}
