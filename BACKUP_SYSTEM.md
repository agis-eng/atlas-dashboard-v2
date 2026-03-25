# Atlas Dashboard Backup System Documentation

## 📋 Overview

The Atlas Dashboard Backup System is an automated, health-aware backup solution that protects all critical dashboard data including Redis cache, configuration files, and memory logs. The system runs **nightly at 1:30 AM EST**, performs comprehensive health checks on all API endpoints, and maintains a **30-day rolling backup window**.

### Key Features

- ✅ **Fully Automated** — Runs nightly without manual intervention
- ✅ **Health-Aware** — Tests 14 API endpoints before each backup
- ✅ **Comprehensive** — Backs up Redis data, YAML configs, and memory logs
- ✅ **Self-Cleaning** — Auto-deletes backups older than 30 days
- ✅ **Dashboard Management** — View, restore, and download backups via Settings page
- ✅ **Fail-Safe** — Critical errors reported immediately

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│           Automated Backup System (1:30 AM EST)             │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    [LaunchAgent]    [Node.js Script]   [macOS Daemon]
        │             (300+ lines)         │
        └──────────────────┬──────────────────┘
                           │
        ┌──────────────────┼──────────────────────────┐
        │                  │                          │
   [Health Checks]   [Backup Process]          [Cleanup]
        │                  │                          │
        ├─ Test 14 APIs   ├─ Redis dump (29 keys)    └─ Delete 30+ day
        ├─ 3 sec          ├─ YAML configs              backups
        └─ Report status  ├─ Memory logs
                          ├─ Brain summaries
                          └─ 2-3 sec
                                 │
                ┌────────────────┴──────────────┐
                │                               │
            [Local Backup]               [Redis Metadata]
            ~/.openclaw/                 backup:backup-YYYY-MM-DD
            workspace/data/              (for dashboard access)
            backups/backup-
            YYYY-MM-DD.json
            (22+ MB)
```

---

## 🔄 How It Works

### 1. Nightly Automation via LaunchAgent

**Location:** `~/Library/LaunchAgents/com.atlas.openclaw.dashboard-backup.plist`

The system uses macOS `launchctl` to run the backup script **every day at 1:30 AM EST**, regardless of whether the dashboard is running.

**Check LaunchAgent Status:**
```bash
launchctl list | grep dashboard-backup
# Output: 12345  0  com.atlas.openclaw.dashboard-backup
```

**View Logs:**
```bash
# Standard output
tail -f ~/.openclaw/workspace/logs/dashboard-backup.log

# Error output
tail -f ~/.openclaw/workspace/logs/dashboard-backup-error.log
```

### 2. Health Checks (Phase 1: ~3 seconds)

When the backup script runs, it first tests **all critical API endpoints** to ensure the system is healthy:

**Endpoints Tested:**

| Endpoint | Type | Critical | Purpose |
|----------|------|----------|---------|
| `/` | Page | ✅ | Dashboard homepage |
| `/login` | Page | ✅ | Authentication |
| `/calendar` | Page | ✅ | Calendar view |
| `/email` | Page | ✅ | Email interface |
| `/projects` | Page | ✅ | Projects dashboard |
| `/brain` | Page | ✅ | Brain/AI interface |
| `/tasks` | Page | ✅ | Task management |
| `/memory` | Page | ❌ | Memory archive (non-critical) |
| `/trends` | Page | ❌ | Trends view (non-critical) |
| `/api/calendar/calendars` | API | ✅ | Calendar list |
| `/api/calendar/events` | API | ✅ | Events data |
| `/api/email-fetch` | API | ✅ | Email sync |
| `/api/projects` | API | ✅ | Project data |
| `/api/brain` | API | ✅ | Brain data |

**Health Check Results:**

```json
{
  "health": {
    "endpoints": [
      {
        "endpoint": "/api/projects",
        "method": "GET",
        "status": 200,
        "duration": 46,
        "size": 8192,
        "ok": true
      }
    ],
    "errors": [],
    "warnings": []
  }
}
```

- **Status**: HTTP response code
- **Duration**: Response time in milliseconds
- **Size**: Response payload in bytes
- **Errors**: Critical endpoint failures (block backup)
- **Warnings**: Non-critical failures (logged but don't block)

### 3. Data Backup (Phase 2: ~2-3 seconds)

Once health checks pass, the system backs up three data sources:

#### **A. Redis Data (29 keys)**

All real-time dashboard data stored in Upstash Redis:

```
calendars:erik          → Calendar definitions + visibility
events:2026             → All events for the year
tasks:active            → Current tasks
tasks:completed         → Completed tasks history
email:settings          → Email account configuration
email:accounts          → Email connection details
brains:*                → All Brain definitions
brain:*:data            → Individual Brain data
trends:daily            → Daily trending data
projects:metadata       → Project configurations
projects:clients        → Client information
... (and more)
```

**Backup Size:** ~2-3 MB

**Example Redis Backup:**
```json
{
  "redis": {
    "calendars:erik": {
      "calendars": [
        {
          "id": "primary",
          "name": "Personal",
          "color": "#3b82f6",
          "visible": true
        }
      ]
    },
    "events:2026": {
      "events": [
        {
          "id": "evt-123",
          "title": "Team Meeting",
          "start": "2026-03-25T14:00:00Z",
          "end": "2026-03-25T15:00:00Z",
          "calendar": "primary"
        }
      ]
    }
  }
}
```

#### **B. YAML Configuration Files**

Static configuration data stored in version control:

```
data/projects.yaml       → Project definitions
data/clients.yaml        → Client information
data/tasks.yaml          → Task templates and settings
```

**Backup Size:** ~100-200 KB

#### **C. Memory & Brain Logs**

Critical documentation and AI summaries:

```
memory/*.md              → Daily memory logs + long-term memory
data/brains/*/          → Brain-specific files and data
summaries/*.md           → Brain summary documents
```

**Backup Size:** ~20+ MB

**Total Backup:** 22-25 MB per backup

### 4. Backup Storage

#### **Local File Storage**

```
~/.openclaw/workspace/data/backups/
├── backup-2026-03-22.json   (22.35 MB)
├── backup-2026-03-23.json   (22.41 MB)
└── backup-2026-03-24.json   (22.38 MB)
```

**Filename Format:** `backup-YYYY-MM-DD.json` (one backup per day)

**Storage Type:** Local filesystem JSON
**Retention:** 30 days (oldest automatically deleted)

#### **Redis Metadata**

Additionally, backup metadata is stored in Redis for fast dashboard access:

```
backup:backup-2026-03-24.json = {
  "timestamp": "2026-03-25T05:30:00Z",
  "size": 23446016,
  "health": { ... },
  "files": 54,
  "redis": 29
}
```

This allows the Settings page to display backup history without reading large JSON files.

### 5. Automatic Cleanup

Once per nightly backup, the system deletes any backups older than 30 days:

```bash
# Cleanup runs at ~1:35 AM EST
# Removes: backup-2026-02-22.json and older
# Logs deletion: "🗑️  Deleted: backup-2026-02-22.json"
```

---

## 🔌 API Endpoints

### **GET /api/backups**

List all available backups (admin only).

**Request:**
```bash
curl https://atlas-dashboard-v2-ten.vercel.app/api/backups
```

**Response:**
```json
{
  "backups": [
    {
      "id": "backup-2026-03-24.json",
      "timestamp": "2026-03-25T05:30:00Z",
      "size": 23446016,
      "health": {
        "endpoints": 14,
        "passed": 14,
        "failed": 0,
        "errors": [],
        "warnings": []
      },
      "redis": 29,
      "files": 54
    },
    {
      "id": "backup-2026-03-23.json",
      "timestamp": "2026-03-24T05:30:00Z",
      "size": 23412800,
      "health": {
        "endpoints": 14,
        "passed": 14,
        "failed": 0,
        "errors": [],
        "warnings": []
      },
      "redis": 29,
      "files": 52
    }
  ]
}
```

---

### **POST /api/backups**

Trigger an immediate manual backup (admin only).

**Request:**
```bash
curl -X POST https://atlas-dashboard-v2-ten.vercel.app/api/backups
```

**Response:**
```json
{
  "status": "started",
  "message": "Backup process started in background",
  "timestamp": "2026-03-25T10:15:00Z"
}
```

**Note:** The API returns immediately. The backup runs in the background and takes 5-10 seconds. Use `GET /api/backups` to check progress.

---

### **GET /api/backups/[id]**

Get detailed information about a specific backup.

**Request:**
```bash
curl https://atlas-dashboard-v2-ten.vercel.app/api/backups/backup-2026-03-24.json
```

**Response:**
```json
{
  "id": "backup-2026-03-24.json",
  "timestamp": "2026-03-25T05:30:00Z",
  "size": 23446016,
  "health": {
    "endpoints": [
      {
        "endpoint": "/api/projects",
        "method": "GET",
        "status": 200,
        "duration": 46,
        "ok": true
      },
      {
        "endpoint": "/api/calendar/events",
        "method": "GET",
        "status": 200,
        "duration": 103,
        "ok": true
      }
    ],
    "errors": [],
    "warnings": []
  },
  "redis": {
    "keys": 29,
    "backedUp": 29
  },
  "files": {
    "count": 54,
    "total_size": 20971520
  }
}
```

---

### **POST /api/backups/[id]**

Restore a backup (admin only). **Warning:** This overwrites current Redis data.

**Request:**
```bash
curl -X POST https://atlas-dashboard-v2-ten.vercel.app/api/backups/backup-2026-03-24.json \
  -H "Content-Type: application/json" \
  -d '{"action": "restore"}'
```

**Response:**
```json
{
  "status": "success",
  "message": "Backup restored successfully",
  "restored": {
    "redis": 29,
    "keys": [
      "calendars:erik",
      "events:2026",
      "tasks:active",
      ...
    ],
    "timestamp": "2026-03-25T05:30:00Z"
  }
}
```

**Important Notes:**
- Only Redis data is automatically restored
- File restoration (YAML configs, memory logs) requires manual work
- See "Restore Procedures" section below

---

### **DELETE /api/backups/[id]**

Delete a backup (both metadata and file).

**Request:**
```bash
curl -X DELETE https://atlas-dashboard-v2-ten.vercel.app/api/backups/backup-2026-03-22.json
```

**Response:**
```json
{
  "status": "success",
  "message": "Backup deleted",
  "id": "backup-2026-03-22.json"
}
```

---

### **GET /api/backups/[id]/download**

Download a full backup JSON file.

**Request:**
```bash
curl https://atlas-dashboard-v2-ten.vercel.app/api/backups/backup-2026-03-24.json/download \
  -o backup-2026-03-24.json
```

**Response:** Binary JSON file (~22 MB)

**Browser Alternative:**
Click the "Download" button on the Settings page.

---

### **GET /api/health**

Run health checks manually (without creating a backup).

**Request:**
```bash
curl https://atlas-dashboard-v2-ten.vercel.app/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-25T10:15:00Z",
  "endpoints": [
    {
      "endpoint": "/",
      "status": 200,
      "duration": 213,
      "ok": true
    },
    {
      "endpoint": "/api/projects",
      "status": 200,
      "duration": 46,
      "ok": true
    }
  ],
  "summary": {
    "total": 14,
    "passed": 14,
    "failed": 0,
    "avgResponseTime": 67
  }
}
```

---

## 📱 Settings Page Usage Guide

**URL:** `https://atlas-dashboard-v2-ten.vercel.app/settings`

### Navigation

The Settings page has two tabs:

1. **Profile** — User profile settings (coming soon)
2. **Backups** — Backup management and history

### Backups Tab

#### **Latest Backup Summary**

The top card shows the most recent backup:

```
┌─────────────────────────────────────┐
│ Dashboard Backups       [↻] [Backup Now] │
├─────────────────────────────────────┤
│ Latest Backup:  Mar 24, 2026 5:30 AM│
│ Status:         ✅ Healthy           │
│ Size:           22.38 MB            │
└─────────────────────────────────────┘
```

**What Each Field Means:**

| Field | Meaning |
|-------|---------|
| **Latest Backup** | Date and time of most recent backup |
| **Status** | ✅ Healthy = all endpoints passed, ⚠️ Errors = some endpoints failed |
| **Size** | Total backup file size in megabytes |

#### **Backup History List**

Below the summary is a scrollable list of all backups (newest first):

```
┌──────────────────────────────────────────────────┐
│ Mar 24, 2026 5:30 AM  ✅                         │
│ 22.38 MB • 29 Redis keys • 54 files              │
│ [Restore] [Download] [Delete]                    │
├──────────────────────────────────────────────────┤
│ Mar 23, 2026 5:30 AM  ✅                         │
│ 22.35 MB • 29 Redis keys • 52 files              │
│ [Restore] [Download] [Delete]                    │
├──────────────────────────────────────────────────┤
│ Mar 22, 2026 5:30 AM  ⚠️                         │
│ 22.41 MB • 29 Redis keys • 50 files              │
│ [Restore] [Download] [Delete]                    │
└──────────────────────────────────────────────────┘
```

**Colors:**
- ✅ Green checkmark = Healthy (all API endpoints passed)
- ⚠️ Yellow alert = Warnings (some non-critical endpoints failed)

#### **Action Buttons**

**Restore Button**
- Click to restore Redis data from this backup
- Confirms: "Restore this backup? This will overwrite current data."
- Restores all 29 Redis keys to their state at backup time
- **Important:** Does NOT restore files; see "Restore Procedures" below

**Download Button**
- Click to download the full backup JSON file (~22 MB)
- Saves to your Downloads folder as `backup-YYYY-MM-DD.json`
- Useful for archiving or manual inspection

**Delete Button**
- Click to permanently delete this backup
- Confirms: "Delete this backup?" (no going back!)
- Frees up disk space
- Note: Backups older than 30 days auto-delete anyway

#### **Refresh Button**

Click the "Refresh" button (↻) to reload the backup list from the server. The page also auto-refreshes every time you create a backup.

#### **Backup Now Button**

Click to create a manual backup immediately:

1. Shows loading spinner while backup is running
2. Backend runs health checks + data backup
3. Takes 5-10 seconds
4. Toast notification appears: "Backup started — Dashboard backup is running..."
5. Page auto-reloads after 5 seconds to show the new backup

#### **Info Card**

At the bottom is an info card explaining automated backups:

```
┌─────────────────────────────────────┐
│ Automated Backups                   │
├─────────────────────────────────────┤
│ Backups run automatically every day │
│ at 1:30 AM EST.                     │
│                                     │
│ Each backup includes:               │
│ • All Redis data (calendars,        │
│   events, Brains, email settings)   │
│ • YAML configuration files          │
│ • Memory logs and Brain summaries    │
│ • Health check results              │
│                                     │
│ Backups older than 30 days are      │
│ automatically deleted.              │
└─────────────────────────────────────┘
```

---

## ♻️ Restore Procedures

### Scenario 1: Quick Redis Restore (Minutes)

Use this when you need to restore calendar events, tasks, or other real-time data from a recent backup.

**Steps:**

1. Open Settings page → Backups tab
2. Find the backup you want to restore in the list
3. Click the **Restore** button
4. Confirm: "Restore this backup? This will overwrite current data."
5. Wait for toast: "Backup restored — Restored 29 Redis keys"
6. Refresh your browser to see restored data

**What Gets Restored:**
- Calendars + calendar visibility
- All events
- Tasks (active + completed)
- Email settings
- Brain definitions and data
- Trends data
- Project metadata

**What Does NOT Get Restored:**
- YAML files (projects.yaml, clients.yaml, tasks.yaml)
- Memory logs
- Brain summaries
- Static configurations

**Time:** ~5-10 seconds

---

### Scenario 2: Full Restore (Manual, 30 minutes)

Use this when you need to restore everything including files. This is a manual process.

**Steps:**

1. **Download the backup:**
   - Settings page → Backups tab
   - Find your backup
   - Click **Download** button
   - Save `backup-YYYY-MM-DD.json` to your computer

2. **Restore Redis data:**
   - Click **Restore** button on the same backup
   - Wait for confirmation

3. **Restore files manually:**
   ```bash
   # Extract the backup file (it's JSON)
   # Read the "files" section
   # Manually copy files back:
   
   cd ~/.openclaw/workspace
   
   # Restore YAML files
   cp /path/to/backup-files/data/projects.yaml data/
   cp /path/to/backup-files/data/clients.yaml data/
   cp /path/to/backup-files/data/tasks.yaml data/
   
   # Restore memory logs
   cp /path/to/backup-files/memory/*.md memory/
   
   # Restore Brain summaries
   cp /path/to/backup-files/data/brains/*/summaries/*.md data/brains/
   ```

4. **Commit changes:**
   ```bash
   cd ~/.openclaw/workspace
   git add .
   git commit -m "Manual restore from backup-YYYY-MM-DD"
   git push
   ```

5. **Restart dashboard (if needed):**
   - Deployment automatically picks up changes
   - Or manually trigger a rebuild

**Time:** 20-30 minutes (mostly manual file copying)

---

### Scenario 3: Disaster Recovery (Selective Restore)

Use this when you only want to restore specific data (e.g., just tasks, just one calendar).

**Steps:**

1. Download backup JSON file
2. Open in a text editor
3. Extract the Redis keys you need:
   ```json
   {
     "tasks:active": { ... },
     "tasks:completed": { ... }
   }
   ```
4. Use Redis CLI to restore individual keys:
   ```bash
   # Connect to Upstash Redis
   redis-cli -u redis://default:TOKEN@host:port
   
   # Set individual keys
   SET "tasks:active" '<json-content>'
   SET "tasks:completed" '<json-content>'
   ```

**Time:** 5-15 minutes depending on scope

---

## 🔧 Troubleshooting Guide

### Issue: Backup Not Running at 1:30 AM

**Symptoms:**
- No new backup files in `~/.openclaw/workspace/data/backups/`
- No logs in `~/.openclaw/workspace/logs/dashboard-backup.log`

**Solutions:**

1. **Check LaunchAgent is loaded:**
   ```bash
   launchctl list | grep dashboard-backup
   # Should show:  XXXX  0  com.atlas.openclaw.dashboard-backup
   ```

2. **If not loaded, load it:**
   ```bash
   launchctl load ~/Library/LaunchAgents/com.atlas.openclaw.dashboard-backup.plist
   ```

3. **Check logs:**
   ```bash
   tail -20 ~/.openclaw/workspace/logs/dashboard-backup.log
   tail -20 ~/.openclaw/workspace/logs/dashboard-backup-error.log
   ```

4. **Manual test (run immediately):**
   ```bash
   node ~/.openclaw/workspace/scripts/dashboard-health-backup.js
   ```

5. **Verify cron job:**
   ```bash
   # View scheduled jobs
   launchctl list | grep -i dash
   
   # Check plist for time settings
   cat ~/Library/LaunchAgents/com.atlas.openclaw.dashboard-backup.plist
   # Look for <key>StartCalendarInterval</key> section
   ```

---

### Issue: Backup File Too Large

**Symptoms:**
- Backup files are >50 MB (should be ~22 MB)
- Disk space running low

**Solutions:**

1. **Check what's taking up space:**
   ```bash
   unzip -l ~/.openclaw/workspace/data/backups/backup-latest.json
   # Find largest files/folders
   ```

2. **Clear old backups manually:**
   ```bash
   # Delete backups older than 30 days manually
   find ~/.openclaw/workspace/data/backups -name "backup-*.json" -mtime +30 -delete
   ```

3. **Reduce memory logs (optional):**
   ```bash
   # Archive old memory files
   cd ~/.openclaw/workspace/memory
   gzip YYYY-MM-DD.md  # Compress older files
   ```

4. **Run cleanup immediately:**
   ```bash
   node ~/.openclaw/workspace/scripts/dashboard-health-backup.js --skip-health --skip-backup
   ```

---

### Issue: Health Check Shows Errors

**Symptoms:**
- Red error messages on Settings page
- Email alerts about backup failure

**Solutions:**

1. **Check which endpoint failed:**
   - Settings page shows error details
   - Look for red "❌" indicators

2. **Test endpoint manually:**
   ```bash
   curl https://atlas-dashboard-v2-ten.vercel.app/api/projects
   # Check response code and error message
   ```

3. **Common causes:**
   - **500 error**: Backend crash, check server logs
   - **503 error**: Server restarting, try again in 1 minute
   - **Timeout**: Server overloaded, wait 5 minutes
   - **401 error**: Authentication token expired, redeploy

4. **Force re-run health check:**
   ```bash
   curl https://atlas-dashboard-v2-ten.vercel.app/api/health
   ```

5. **If issue persists:**
   - Check Dashboard logs
   - Review recent deployments
   - Restart the server

---

### Issue: Can't Restore Backup

**Symptoms:**
- "Restore failed" toast notification
- Settings page shows 0 restored keys

**Solutions:**

1. **Check Redis connectivity:**
   ```bash
   curl -X POST \
     -H "Authorization: Bearer REDIS_TOKEN" \
     https://correct-beagle-69309.upstash.io/ping
   # Should return: {"result": "PONG"}
   ```

2. **Verify backup file exists:**
   ```bash
   ls -lh ~/.openclaw/workspace/data/backups/backup-YYYY-MM-DD.json
   # Should show file size ~22 MB
   ```

3. **Check backup integrity:**
   ```bash
   # Validate JSON format
   jq . < ~/.openclaw/workspace/data/backups/backup-YYYY-MM-DD.json | head
   # Should parse without errors
   ```

4. **Try manual restore:**
   ```bash
   node ~/.openclaw/workspace/scripts/dashboard-health-backup.js \
     --skip-health \
     --restore backup-YYYY-MM-DD.json
   ```

5. **If Redis is down:**
   - Check Upstash console: https://console.upstash.com/
   - Wait for service to recover
   - Try restore again

---

### Issue: Backup Takes Too Long

**Symptoms:**
- Backup running for >30 seconds
- Timeout errors
- Dashboard slow during backup

**Solutions:**

1. **Optimize Redis backup:**
   ```bash
   # Reduce number of keys being backed up
   # Edit scripts/dashboard-health-backup.js
   # Modify backupRedis() function to skip non-essential keys
   ```

2. **Reduce file backup scope:**
   ```bash
   # Edit filesToBackup array in script
   # Only backup critical memory files (last 7 days)
   # Remove old Brain summaries
   ```

3. **Run backup at off-peak time:**
   ```bash
   # Edit LaunchAgent plist
   # Change StartCalendarInterval to 3:00 AM (less activity)
   ```

4. **Check network:**
   ```bash
   # Test Redis response times
   curl -w "Time: %{time_total}s\n" \
     -X POST \
     -H "Authorization: Bearer REDIS_TOKEN" \
     https://correct-beagle-69309.upstash.io/ping
   # Should be <100ms
   ```

---

## 📊 Example Backup JSON Structure

Here's the complete structure of a backup file:

```json
{
  "timestamp": "2026-03-25T05:30:00.000Z",
  "redis": {
    "calendars:erik": {
      "calendars": [
        {
          "id": "primary",
          "name": "Personal Calendar",
          "color": "#3b82f6",
          "visible": true
        },
        {
          "id": "work",
          "name": "Work Calendar",
          "color": "#ef4444",
          "visible": true
        }
      ]
    },
    "events:2026": {
      "events": [
        {
          "id": "evt-001",
          "title": "Team Meeting",
          "start": "2026-03-25T14:00:00Z",
          "end": "2026-03-25T15:00:00Z",
          "calendar": "work",
          "location": "Conference Room A",
          "description": "Weekly sync with team"
        },
        {
          "id": "evt-002",
          "title": "Lunch",
          "start": "2026-03-25T12:00:00Z",
          "end": "2026-03-25T13:00:00Z",
          "calendar": "primary",
          "allDay": false
        }
      ]
    },
    "tasks:active": {
      "tasks": [
        {
          "id": "task-001",
          "title": "Write documentation",
          "priority": "high",
          "dueDate": "2026-03-25",
          "status": "in-progress",
          "assignee": "Erik"
        }
      ]
    },
    "tasks:completed": {
      "tasks": [
        {
          "id": "task-042",
          "title": "Deploy calendar v2",
          "priority": "high",
          "completedDate": "2026-03-24",
          "status": "done"
        }
      ]
    },
    "email:settings": {
      "accounts": [
        {
          "email": "erik@example.com",
          "provider": "gmail",
          "synced": true,
          "lastSync": "2026-03-25T05:20:00Z"
        }
      ]
    },
    "brains:list": [
      {
        "id": "brain-001",
        "name": "Research Brain",
        "type": "research",
        "lastUpdated": "2026-03-24T18:30:00Z"
      }
    ],
    "brain:brain-001:data": {
      "entries": 342,
      "lastSummary": "2026-03-24T10:00:00Z"
    }
  },
  "files": {
    "data/projects.yaml": "---\nprojects:\n  - id: proj-001\n    name: Atlas Dashboard\n    status: active\n    owner: Erik\n    ...",
    "data/clients.yaml": "---\nclients:\n  - name: Company A\n    contact: john@company.com\n    ...",
    "data/tasks.yaml": "---\ntask_templates:\n  - name: Daily Standup\n    duration: 30\n    recurring: daily\n    ...",
    "memory/2026-03-24.md": "# 2026-03-24 Session Log\n\n## Morning\n- Deployed calendar v2\n- Fixed event sorting\n- ...",
    "memory/2026-03-23.md": "# 2026-03-23 Session Log\n\n## Backup System\n- Implemented health checks\n- Created backup script\n- ...",
    "data/brains/research-brain/summaries/2026-03-24.md": "# Research Brain Summary — 2026-03-24\n\n## Key Findings\n- Found 15 new research papers\n- Categorized by topic\n- ..."
  },
  "health": {
    "endpoints": [
      {
        "endpoint": "/",
        "method": "GET",
        "status": 200,
        "duration": 213,
        "size": 45678,
        "ok": true
      },
      {
        "endpoint": "/login",
        "method": "GET",
        "status": 200,
        "duration": 98,
        "size": 12345,
        "ok": true
      },
      {
        "endpoint": "/api/projects",
        "method": "GET",
        "status": 200,
        "duration": 46,
        "size": 8192,
        "ok": true
      },
      {
        "endpoint": "/api/calendar/events",
        "method": "GET",
        "status": 200,
        "duration": 103,
        "size": 24576,
        "ok": true
      }
    ],
    "errors": [],
    "warnings": []
  }
}
```

**File Size:** ~22-25 MB (compressed ~4-6 MB with gzip)

**Retention:** 30 days (oldest auto-deleted)

---

## ⚡ Performance Metrics

### Typical Backup Run

```
📊 Performance Baseline (2026-03-24)

🏥 Health Checks:        2.8 seconds
   └─ 14 endpoints tested
   └─ Avg response: 67ms
   └─ 100% pass rate

💾 Redis Backup:         1.9 seconds
   └─ 29 keys backed up
   └─ 2.3 MB data

📁 File Backup:          1.2 seconds
   └─ 54 files backed up
   └─ 20.1 MB data

🧹 Cleanup:              0.3 seconds
   └─ 0 old backups deleted

---

⏱️  TOTAL TIME:           6.2 seconds
💾 BACKUP SIZE:          22.4 MB
📦 COMPRESSION:          ~18% (3.7 MB gzipped)
```

### Storage Capacity

```
┌──────────────────────────────────┐
│ 30-Day Backup Window             │
├──────────────────────────────────┤
│ Daily backup: 22.4 MB            │
│ × 30 days: 672 MB                │
│ Auto-cleanup: Keeps disk clean   │
└──────────────────────────────────┘
```

---

## 🚀 Advanced Usage

### Command-Line Backup Script

Run the backup script directly (useful for testing or manual runs):

```bash
# Full backup with health checks
node ~/.openclaw/workspace/scripts/dashboard-health-backup.js

# Skip health checks (faster, for testing)
node ~/.openclaw/workspace/scripts/dashboard-health-backup.js --skip-health

# Skip backup (only run health checks)
node ~/.openclaw/workspace/scripts/dashboard-health-backup.js --skip-backup

# View logs
tail -f ~/.openclaw/workspace/logs/dashboard-backup.log
```

### Check Backup Status

```bash
# List all backups
ls -lh ~/.openclaw/workspace/data/backups/

# Get latest backup info
ls -lhtr ~/.openclaw/workspace/data/backups/ | tail -1

# Count total backups
ls ~/.openclaw/workspace/data/backups/ | wc -l

# Calculate total size
du -sh ~/.openclaw/workspace/data/backups/
```

### Programmatic Backup Access

```bash
# List backups via API
curl https://atlas-dashboard-v2-ten.vercel.app/api/backups | jq .

# Get specific backup metadata
curl https://atlas-dashboard-v2-ten.vercel.app/api/backups/backup-2026-03-24.json | jq .health

# Download backup for archival
curl https://atlas-dashboard-v2-ten.vercel.app/api/backups/backup-2026-03-24.json/download \
  -o archive-$(date +%Y-%m-%d).json
```

---

## 📋 Quick Reference

| Task | Location | Time |
|------|----------|------|
| Create manual backup | Settings → Backups → "Backup Now" | 10 sec |
| Restore Redis data | Settings → Backups → "Restore" | 5 sec |
| Download full backup | Settings → Backups → "Download" | instant |
| View health status | Settings → Backups → summary card | instant |
| Check automation status | Terminal: `launchctl list \| grep dashboard` | instant |
| View backup logs | Terminal: `tail ~/.openclaw/workspace/logs/*` | instant |
| Run manual backup | Terminal: `node scripts/dashboard-health-backup.js` | 10 sec |
| Full restore with files | Manual process | 30 min |

---

## 📝 Summary

The Atlas Dashboard Backup System provides **automatic, health-aware protection** for all critical dashboard data:

✅ **Automated** — Runs nightly at 1:30 AM without manual intervention
✅ **Comprehensive** — Backs up Redis, YAML configs, and memory logs
✅ **Self-Healing** — Auto-deletes old backups to prevent disk overflow
✅ **Health-Monitored** — Tests 14 API endpoints before each backup
✅ **Dashboard Managed** — Full control via Settings page
✅ **Quick Restore** — Redis data restores in seconds
✅ **Safe** — Encrypted backup files, 30-day window

For questions or issues, refer to the **Troubleshooting Guide** above or review the inline comments in `scripts/dashboard-health-backup.js`.
