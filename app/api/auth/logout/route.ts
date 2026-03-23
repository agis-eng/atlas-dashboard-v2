import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/session";

export async function POST() {
  try {
    await deleteSession();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/logout]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
