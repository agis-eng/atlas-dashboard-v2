# AGIS Bot Integration Guide

## Anton's Dashboard Login

**Email:** `anton@chelimitless.com`  
**Password:** `Anton2026!Secure`  
**Profile:** Anton (filtered view - sees only Anton's projects/emails)

### Create Anton's Account

Once the deployment is live, run:

```bash
curl -X POST https://atlas-dashboard-v2-ten.vercel.app/api/admin/create-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "anton@chelimitless.com",
    "name": "Anton",
    "password": "Anton2026!Secure",
    "profile": "anton",
    "adminKey": "atlas-create-user-2026"
  }'
```

Or log into the dashboard and use the admin panel (coming soon).

---

## AGIS Bot API Integration

The AGIS bot can make code changes via the dashboard API.

### API Endpoint

**URL:** `https://atlas-dashboard-v2-ten.vercel.app/api/bot/code-change`  
**Method:** `POST`  
**Auth:** Bearer token

### Authentication

**Token:** `agis-bot-secure-token-2026`  
**Header:** `Authorization: Bearer agis-bot-secure-token-2026`

### Request Format

```json
{
  "projectId": "kennyslayer",
  "request": "Change the hero button from blue to purple",
  "repoUrl": "https://github.com/agis-eng/kennyslayer",
  "branch": "main"
}
```

### Response Format

```json
{
  "success": true,
  "plan": "AI-generated code change plan...",
  "message": "AI generated a plan for project kennyslayer",
  "projectId": "kennyslayer",
  "repoUrl": "https://github.com/agis-eng/kennyslayer"
}
```

### Example AGIS Bot Code

```javascript
// In AGIS bot
async function makeCodeChange(projectId, userRequest) {
  const response = await fetch('https://atlas-dashboard-v2-ten.vercel.app/api/bot/code-change', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer agis-bot-secure-token-2026'
    },
    body: JSON.stringify({
      projectId: projectId,
      request: userRequest,
      repoUrl: getRepoUrl(projectId), // Get from project data
      branch: 'main'
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    return `✅ Code change plan generated:\n${data.plan}`;
  } else {
    return `❌ Error: ${data.error}`;
  }
}

// Usage in AGIS
// User: "@agis change the button color to green on kennyslayer"
const result = await makeCodeChange('kennyslayer', 'change the button color to green');
console.log(result);
```

### Security

- The bot token is stored in `.env` as `AGIS_BOT_TOKEN`
- Change the token in production: `AGIS_BOT_TOKEN=your-secure-random-token`
- Never commit the token to GitHub
- Rotate the token if compromised

### Rate Limiting

- Currently no rate limits
- Consider adding rate limiting in production
- Monitor usage via Vercel analytics

### Features

**Current (Phase 1):**
- ✅ AI code change planning
- ✅ Natural language processing
- ✅ Multi-project support
- ✅ Secure token auth

**Coming Soon (Phase 2):**
- ⏳ Automatic GitHub PR creation
- ⏳ Vercel deployment triggering
- ⏳ Change preview URLs
- ⏳ Rollback support

---

## Multi-User Access

The dashboard supports multi-user access with profile filtering:

### Erik's View
- Email: `erik@rcmn.com`
- Password: `changeme123`
- Profile: `erik`
- Sees: All projects, Erik's emails, shared data

### Anton's View
- Email: `anton@chelimitless.com`
- Password: `Anton2026!Secure`
- Profile: `anton`
- Sees: Anton's projects, Anton's emails, shared data

### Data Filtering

**Shared:**
- Projects (all)
- Tasks (all)
- Brains (all)
- Clients (all)

**Filtered by Profile:**
- Emails (only user's email account)
- Chat history (per user)
- Notifications (per user)

---

## Testing

### Test Anton's Login
1. Go to: https://atlas-dashboard-v2-ten.vercel.app/login
2. Email: `anton@chelimitless.com`
3. Password: `Anton2026!Secure`
4. Should see Anton's filtered view

### Test AGIS Bot API
```bash
curl -X POST https://atlas-dashboard-v2-ten.vercel.app/api/bot/code-change \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer agis-bot-secure-token-2026" \
  -d '{
    "projectId": "test-project",
    "request": "Add a footer with copyright text",
    "repoUrl": "https://github.com/test/repo",
    "branch": "main"
  }'
```

Expected response: `200 OK` with success + plan

---

## Troubleshooting

### Anton Can't Log In
1. Verify account was created: Check Redis or run create-user API again
2. Check password: `Anton2026!Secure` (case-sensitive)
3. Check email: `anton@chelimitless.com` (lowercase)

### AGIS Bot 401 Unauthorized
1. Verify token: `agis-bot-secure-token-2026`
2. Check header: `Authorization: Bearer <token>`
3. Verify deployment has latest code

### AGIS Bot 500 Error
1. Check Anthropic API key is set in Vercel env
2. Check logs in Vercel dashboard
3. Verify request body format is correct

---

## Next Steps

1. **Create Anton's account** (run the curl command above)
2. **Test Anton's login** (verify he sees his filtered view)
3. **Integrate AGIS bot** (add API calls to AGIS codebase)
4. **Phase 2**: Add GitHub PR automation
5. **Phase 2**: Add automatic deployment triggering

---

## Support

Questions? Contact Erik or check:
- Dashboard: https://atlas-dashboard-v2-ten.vercel.app
- GitHub: https://github.com/agis-eng/atlas-dashboard-v2
- Vercel: https://vercel.com/agis-eng/atlas-dashboard-v2
