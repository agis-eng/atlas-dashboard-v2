# Overnight Dashboard Enhancement Task

## Tasks to complete:
1. ✅ Daily summary LaunchAgent (11:30 PM)
2. ⏳ Add GitHub/Vercel URLs to project detail pages
3. ⏳ Enable code change automation from project chat
4. ⏳ Create changelog system

## Implementation Plan:

### Task 2: GitHub/Vercel Links
- File: `app/projects/[id]/page.tsx`
- Add section showing repoUrl, vercelUrl, githubBranch
- Use ExternalLink icon from lucide-react

### Task 3: Code Change Automation
- File: `app/api/project-chat/route.ts`
- Detect "change..." or "update..." requests
- Execute git operations in project repo
- Use agis@manifestbot.ai as git author

### Task 4: Changelog
- Create `data/changelogs/` directory
- Format: `{projectId}.md` per project
- Auto-append on code changes
- Display on project pages

## Starting now...
