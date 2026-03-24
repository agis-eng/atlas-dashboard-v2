# Calendar Feature - Implementation Plan

Based on the screenshot and your requirements, here's the complete calendar system design.

## 🎯 Core Features

### 1. Multi-Calendar Support
- **CalDAV Integration** (you already have this working!)
  - Erik's calendar: `erik@rcmn.com`
  - Anton's calendar: `anton@chelimitless.com`
  - Add more calendars (Google via CalDAV, iCloud, etc.)
  
- **Color Coding**
  - Each calendar gets a unique color
  - Events display in calendar's color
  - Toggle visibility per calendar

### 2. Calendar Views

**Month View** (like screenshot)
- 7-column grid (Sun-Sat)
- Event chips show title + time
- All-day events at top
- Click empty space to create
- Drag events to move

**Week View**
- Hour-by-hour timeline (6am-11pm)
- Multi-day events span columns
- 30-min time slots
- Current time indicator

**Day View**
- Single column timeline
- More detail per event
- Hourly breakdown

**Agenda View**
- List format
- Group by date
- Quick scan of upcoming

### 3. Event Management

**Create Event**
- Quick create: Click date/time
- Full form: Title, time, calendar, notes, attendees
- Recurring: Daily, weekly, monthly patterns
- Reminders: 5min, 15min, 1hr, 1day before

**Edit Event**
- Click event to open modal
- Inline editing for quick changes
- Delete with confirmation
- Move to different calendar

**Smart Features**
- Conflict detection (overlapping events)
- Travel time buffer (add 15min before/after)
- Suggest meeting times (find gaps)
- Auto-categorize (client meetings, personal, work)

### 4. AI Calendar Assistant 🤖

**Natural Language Commands:**

```
"Schedule meeting with John tomorrow at 2pm"
→ Creates event: "Meeting with John" @ 2pm tomorrow

"Clear my calendar Friday afternoon" 
→ Deletes events 12pm-5pm Friday

"What's my schedule this week?"
→ Lists all events Mon-Fri

"Find time for 1-hour meeting with team"
→ Suggests 3 available slots

"Block off lunch every weekday"
→ Creates recurring 12-1pm events

"Remind me about quarterly review next Monday"
→ Creates reminder event

"Move today's 3pm to tomorrow same time"
→ Reschedules event

"What meetings do I have with Sarah?"
→ Searches and lists

"Am I free Thursday morning?"
→ Checks 9am-12pm availability

"Schedule weekly standup Mon/Wed/Fri 9am"
→ Creates recurring event
```

**AI Tools Available:**
- `create_event` - Add calendar events
- `update_event` - Modify existing events
- `delete_event` - Remove events
- `search_events` - Find events by criteria
- `find_available_time` - Suggest open slots
- `get_schedule` - Show events for date range

### 5. Data Schema

**Calendar Object:**
```typescript
interface Calendar {
  id: string;
  name: string;
  owner: 'erik' | 'anton';
  caldavUrl?: string;
  color: string; // hex color
  visible: boolean;
  readOnly: boolean;
  type: 'caldav' | 'google' | 'local';
  credentials?: {
    username: string;
    password: string; // encrypted
  };
}
```

**Event Object:**
```typescript
interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO 8601
  end: string;
  allDay: boolean;
  description?: string;
  location?: string;
  attendees?: string[];
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: string;
  };
  reminders?: number[]; // minutes before
  color?: string; // override calendar color
  status: 'confirmed' | 'tentative' | 'cancelled';
}
```

### 6. API Endpoints

```
GET  /api/calendar/calendars
POST /api/calendar/calendars (add new calendar)
PUT  /api/calendar/calendars/:id (update settings)
DELETE /api/calendar/calendars/:id

GET  /api/calendar/events?start=...&end=...
POST /api/calendar/events (create event)
PUT  /api/calendar/events/:id (update event)
DELETE /api/calendar/events/:id

POST /api/calendar/ai (AI assistant commands)
GET  /api/calendar/availability (find free slots)
```

### 7. Storage Strategy

**Option A: Redis Only** (simple, fast)
- Store all events in Redis
- Sync to CalDAV on create/update/delete
- Good for: Quick prototype

**Option B: CalDAV Primary** (your current setup)
- CalDAV is source of truth
- Cache in Redis for speed
- Good for: Production, multi-device sync

**Option C: Hybrid**
- Local-only calendars in Redis
- External calendars via CalDAV
- Good for: Flexibility

**Recommended: Option B + fallback to A for local calendars**

### 8. UI Components

```
components/
├── calendar-view.tsx          # Main calendar grid/timeline
├── calendar-ai.tsx            # AI chat sidebar
├── calendar-settings.tsx      # Calendar management modal
├── event-modal.tsx            # Create/edit event form
├── event-chip.tsx             # Event display in calendar
├── time-slot.tsx              # Clickable time slot
└── calendar-sync-status.tsx   # Sync indicator
```

### 9. Implementation Steps

**Phase 1: Basic Calendar** (2-3 hours)
1. Create calendar page with month view
2. Fetch events from existing CalDAV
3. Display events as chips
4. Add navigation (prev/next month, today)

**Phase 2: Event Management** (2-3 hours)
1. Click to create event modal
2. Save event to CalDAV
3. Edit existing events
4. Delete events

**Phase 3: AI Assistant** (2-3 hours)
1. Create AI chat sidebar
2. Natural language parsing
3. Tool calling for calendar operations
4. Smart scheduling suggestions

**Phase 4: Multi-Calendar** (1-2 hours)
1. Calendar settings page
2. Add multiple calendars
3. Toggle visibility
4. Color coding

**Phase 5: Advanced Views** (2-3 hours)
1. Week view with timeline
2. Day view
3. Agenda list view
4. Responsive mobile layout

**Total: ~10-15 hours for complete feature**

### 10. Quick Start (Minimal Viable Calendar)

Want to start simple? Here's the 1-hour MVP:

1. **Calendar page** - Month grid only
2. **Fetch events** - From your existing erik@rcmn.com CalDAV
3. **Display events** - Simple colored chips
4. **Click to view** - Event details modal
5. **No editing yet** - Read-only to start

Then add features incrementally:
- Week view
- Create events
- AI assistant
- Multi-calendar

---

## 🚀 Ready to Build?

I can implement any of these phases. What would you like to start with?

**Option 1:** Full feature (all phases) - Takes longer but complete
**Option 2:** MVP first - Working calendar in 1 hour, then iterate
**Option 3:** AI-first - Calendar + AI assistant, skip advanced views for now

Let me know and I'll start coding! 🎯

## 🎉 UPDATE: Google Calendar Support Added!

### Google Calendar via CalDAV

Google Calendar works seamlessly with CalDAV! Here's how to connect:

**Setup:**
1. Go to Calendar Settings → Click "Add Calendar"
2. Select "Google Calendar"
3. Enter your Gmail address (e.g., `erik@gmail.com`)
4. Generate an App Password:
   - Visit: https://myaccount.google.com/apppasswords
   - Create password for "Calendar"
   - Copy the 16-character code
5. Paste the App Password
6. Click "Add Calendar"

**What Works:**
- ✅ Read all events from Google Calendar
- ✅ Create new events (syncs to Google)
- ✅ Edit events (syncs to Google)
- ✅ Delete events (syncs to Google)
- ✅ Multi-calendar support (personal + work + shared)
- ✅ Color coding per calendar
- ✅ Toggle visibility

**Google CalDAV Settings:**
- Server: `apidata.googleusercontent.com`
- Port: `443` (HTTPS)
- Protocol: CalDAV over HTTPS

**Multiple Google Calendars:**
You can add:
- Personal Google Calendar (`personal@gmail.com`)
- Work Google Calendar (`work@company.com`)
- Shared calendars (with proper permissions)
- Family calendars

Each shows up separately with its own color!

