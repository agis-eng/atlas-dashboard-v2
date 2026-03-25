import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

interface FileChange {
  path: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
}

async function createGitHubPR(
  owner: string,
  repo: string,
  baseBranch: string,
  changes: FileChange[],
  prTitle: string,
  prBody: string
) {
  const https = require('https');
  
  // Create a new branch
  const branchName = `ai-changes-${Date.now()}`;
  
  // 1. Get the base branch ref
  const getRefResponse = await new Promise<any>((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Atlas-Dashboard',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    
    const req = https.request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: any) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
  
  const baseSha = getRefResponse.object.sha;
  
  // 2. Create new branch
  await new Promise((resolve, reject) => {
    const data = JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    });
    
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/git/refs`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Atlas-Dashboard',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res: any) => {
      let body = '';
      res.on('data', (chunk: any) => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
  
  // 3. Update files on the new branch
  for (const change of changes) {
    // Get current file SHA if updating
    let fileSha = null;
    
    if (change.operation === 'update') {
      try {
        const fileResponse = await new Promise<any>((resolve, reject) => {
          const options = {
            hostname: 'api.github.com',
            path: `/repos/${owner}/${repo}/contents/${change.path}?ref=${branchName}`,
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'User-Agent': 'Atlas-Dashboard',
              'Accept': 'application/vnd.github.v3+json'
            }
          };
          
          const req = https.request(options, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
          });
          req.on('error', reject);
          req.end();
        });
        
        fileSha = fileResponse.sha;
      } catch (err) {
        // File doesn't exist, treat as create
        change.operation = 'create';
      }
    }
    
    // Update or create file
    const fileData = JSON.stringify({
      message: `AI: Update ${change.path}`,
      content: Buffer.from(change.content).toString('base64'),
      branch: branchName,
      ...(fileSha && { sha: fileSha })
    });
    
    await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/contents/${change.path}`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'Atlas-Dashboard',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'Content-Length': fileData.length
        }
      };
      
      const req = https.request(options, (res: any) => {
        let body = '';
        res.on('data', (chunk: any) => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(fileData);
      req.end();
    });
  }
  
  // 4. Create Pull Request
  const prData = JSON.stringify({
    title: prTitle,
    body: prBody,
    head: branchName,
    base: baseBranch
  });
  
  const prResponse = await new Promise<any>((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/pulls`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Atlas-Dashboard',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': prData.length
      }
    };
    
    const req = https.request(options, (res: any) => {
      let body = '';
      res.on('data', (chunk: any) => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(prData);
    req.end();
  });
  
  return {
    prUrl: prResponse.html_url,
    prNumber: prResponse.number,
    branchName
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { request: userRequest, repoUrl, branch } = body;

    if (!userRequest || !repoUrl) {
      return NextResponse.json(
        { error: "Missing request or repository URL" },
        { status: 400 }
      );
    }

    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { error: "GitHub token not configured" },
        { status: 500 }
      );
    }

    // Extract repo owner and name from URL
    const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) {
      return NextResponse.json(
        { error: "Invalid GitHub URL" },
        { status: 400 }
      );
    }

    const [, owner, repo] = repoMatch;
    const cleanRepo = repo.replace(/\.git$/, '');
    const baseBranch = branch || 'main';

    // Use Claude to generate code changes
    const prompt = `You are a helpful coding assistant. Generate specific file changes for this request.

Project: ${cleanRepo}
Repository: ${owner}/${cleanRepo}

User request: "${userRequest}"

Respond with a JSON array of file changes in this EXACT format:
[
  {
    "path": "path/to/file.tsx",
    "content": "complete new file content here",
    "operation": "update",
    "description": "Brief description of change"
  }
]

Include COMPLETE file content (not diffs). Be specific and practical.
Only modify files that are necessary.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const response = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({
        success: false,
        error: "AI did not generate valid changes format",
        plan: response
      });
    }

    const changes: FileChange[] = JSON.parse(jsonMatch[0]);
    
    // Create PR
    const prInfo = await createGitHubPR(
      owner,
      cleanRepo,
      baseBranch,
      changes,
      `AI: ${userRequest.substring(0, 50)}`,
      `## AI-Generated Changes\n\n**Request:** ${userRequest}\n\n### Changes Made:\n${changes.map(c => `- ${c.path}: ${c.description || c.operation}`).join('\n')}\n\n---\n*Generated by Atlas Dashboard AI Code Assistant*`
    );

    return NextResponse.json({
      success: true,
      prUrl: prInfo.prUrl,
      prNumber: prInfo.prNumber,
      branchName: prInfo.branchName,
      changesCount: changes.length,
      message: `Pull request #${prInfo.prNumber} created successfully!`
    });

  } catch (error: any) {
    console.error("AI code error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process request", details: error.stack },
      { status: 500 }
    );
  }
}
