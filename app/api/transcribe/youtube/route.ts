import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await request.json();

    if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    const timestamp = Date.now();
    const tempDir = `/tmp/youtube-${timestamp}`;
    const outputDir = path.join(process.env.HOME || '/Users/eriklaine', '.openclaw/workspace/data/transcripts');

    // Create directories
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // Get video title
      const { stdout: title } = await execPromise(`yt-dlp --get-title --no-playlist "${url}"`);
      const videoTitle = title.trim();

      // Download audio
      await execPromise(`cd "${tempDir}" && yt-dlp -x --audio-format mp3 --audio-quality 0 --output "audio.%(ext)s" --no-playlist "${url}"`);

      // Check if audio file exists
      const audioPath = path.join(tempDir, 'audio.mp3');
      try {
        await fs.access(audioPath);
      } catch {
        throw new Error('Audio download failed');
      }

      // Transcribe
      await execPromise(`cd "${tempDir}" && insanely-fast-whisper --file-name audio.mp3 --device-id mps --transcript-path transcript.json --timestamp chunk`);

      // Read transcript
      const transcriptData = JSON.parse(await fs.readFile(path.join(tempDir, 'transcript.json'), 'utf8'));
      const transcript = transcriptData.text;

      // Get duration
      let duration = 0;
      try {
        const { stdout: durationStr } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
        duration = parseInt(durationStr.trim());
      } catch {
        duration = 0;
      }

      // Generate AI summary
      let summary = "";
      
      if (process.env.ANTHROPIC_API_KEY) {
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });

        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Summarize this YouTube video transcript concisely. Provide:

1. **Overview** (2-3 sentences)
2. **Key Points** (5-10 bullet points)
3. **Main Takeaways** (3-5 actionable insights)

Transcript:

${transcript}`
          }]
        });

        summary = message.content[0].type === 'text' ? message.content[0].text : '';
      } else {
        summary = '(AI summary requires ANTHROPIC_API_KEY)';
      }

      // Save to file
      const slug = videoTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
      const outputFile = path.join(outputDir, `${new Date().toISOString().split('T')[0]}_${slug}.md`);
      
      const markdown = `# ${videoTitle}

**Source:** ${url}
**Transcribed:** ${new Date().toLocaleString()}
**Duration:** ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}

---

## 🤖 AI Summary

${summary}

---

## 📝 Full Transcript

${transcript}
`;

      await fs.writeFile(outputFile, markdown);

      // Cleanup
      await execPromise(`rm -rf "${tempDir}"`);

      return NextResponse.json({
        success: true,
        title: videoTitle,
        transcript,
        summary,
        duration,
        url,
        savedTo: outputFile
      });

    } catch (error: any) {
      // Cleanup on error
      try {
        await execPromise(`rm -rf "${tempDir}"`);
      } catch {}
      
      throw error;
    }

  } catch (error: any) {
    console.error('[Transcribe API] Error:', error);
    return NextResponse.json(
      { error: error.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
