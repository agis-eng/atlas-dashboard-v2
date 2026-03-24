import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  
  const changelogPath = path.join(
    process.cwd(),
    "data",
    "changelogs",
    `${id}.md`
  );

  try {
    if (!fs.existsSync(changelogPath)) {
      return new NextResponse("", { status: 200 });
    }

    const content = fs.readFileSync(changelogPath, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Error reading changelog:", error);
    return NextResponse.json(
      { error: "Failed to read changelog" },
      { status: 500 }
    );
  }
}
