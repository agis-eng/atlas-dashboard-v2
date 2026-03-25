# Atlas Calendar Guide

Welcome to the Atlas Calendar system! This guide covers everything you need to know to manage your events efficiently.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Adding Calendars](#adding-calendars)
3. [Calendar Views](#calendar-views)
4. [Managing Visibility](#managing-visibility)
5. [Color Coding](#color-coding)
6. [Working with Events](#working-with-events)
7. [Navigation Tips](#navigation-tips)
8. [Troubleshooting](#troubleshooting)
9. [FAQ](#faq)

---

## Getting Started

### Accessing the Calendar

1. Navigate to the **Calendar** section from the main dashboard
2. You'll see a sidebar on the left with your calendars and a main calendar view on the right

[Screenshot: Calendar sidebar with My Calendars section]

### The Interface at a Glance

- **Left Sidebar**: Calendar list, quick actions, and refresh button
- **Main Area**: Calendar view with date navigation controls
- **Top Controls**: View mode selection and date navigation
- **Quick Actions**: "New Event" button and "AI Assistant" button

---

## Adding Calendars

The Atlas Calendar supports multiple calendar sources: **Google Calendar** and **CalDAV** (RCMN and compatible services).

### Adding a Google Calendar

1. Click the **Settings** icon (⚙️) in the "My Calendars" section
2. Look for the **Google Calendar** option
3. Click **Connect Google Calendar**
4. You'll be redirected to Google's authentication page
5. Grant Atlas permission to access your calendar
6. Your Google Calendar will appear in "My Calendars" automatically

### Adding a CalDAV Calendar

CalDAV allows you to connect to services like RCMN, Nextcloud, or other CalDAV-compatible servers.

1. Click the **Settings** icon (⚙️) in the "My Calendars" section
2. Select **Add CalDAV Calendar**
3. Enter the following information:
   - **Calendar Name**: Give it a recognizable name (e.g., "RCMN", "Work")
   - **Server URL**: The CalDAV server endpoint (e.g., `https://rcmn.example.com/caldav/`)
   - **Username**: Your login credentials
   - **Password**: Your password (stored securely)
   - **Calendar Path**: The specific calendar path (ask your IT admin if unsure)
4. Click **Save** and the calendar will sync immediately
5. Events from that calendar will appear with a unique color

[Screenshot: CalDAV settings form]

### Multiple Calendars

You can add as many calendars as you need:
- Personal Google Calendar
- Work Google Calendar
- RCMN calendar
- Team calendars
- Shared calendars

Each calendar operates independently and can be hidden/shown as needed.

---

## Calendar Views

The Atlas Calendar supports 5 different viewing modes. Switch between them using the tabs at the top of the calendar.

### Month View 📅

**Best for:** Getting a big-picture overview, planning ahead, seeing the entire month at once

**Features:**
- See all events in a calendar grid
- Days from adjacent months shown in gray
- Upcoming month buttons highlighted
- Click any day to switch to Day view
- Hover over events for more details

**Navigation:**
- Use the **← Previous** and **Next →** buttons to move between months
- Click **Today** to jump to the current month

[Screenshot: Month view showing March 2026]

### Week View 📊

**Best for:** Detailed time management, seeing your weekly schedule with time slots

**Features:**
- 7 columns (Sunday–Saturday) with hourly time slots
- Events show at their exact times
- Shows 6 AM to 11 PM time range
- Click time slots to quickly see what's happening
- Scroll down to see later hours

**Navigation:**
- Use the **← Previous** and **Next →** buttons to move week-by-week
- Click **Today** to jump to the current week

[Screenshot: Week view with hourly grid]

### Day View 🔍

**Best for:** Deep diving into a specific day, hour-by-hour planning

**Features:**
- Single-day view with 60-minute time slots
- Full event details visible (title, time, location)
- Scroll to see all hours
- Click events to see full details

**How to Access:**
- Click any day in Month view
- Use the **← Previous** and **Next →** buttons to move day-by-day
- Click the date number in the center

[Screenshot: Day view showing detailed hour-by-hour schedule]

### Next N Days View 📌

**Best for:** Quick overview of upcoming events, focusing on the short term

**Features:**
- See upcoming events for the next 1–7 days
- Choose how many days to display (1–7 days)
- "Today" is highlighted with a blue border
- Shows event count per day
- Perfect for checking what's coming up this week

**How to Use:**
1. Click the **Next Nd** tab (where N is the number of days)
2. Use the dropdown menu on the right to change the number of days (1, 2, 3, 4, 5, 6, or 7)
3. Scroll down to see all events

[Screenshot: Next 3 Days view]

### Agenda View 📋

**Best for:** A simple list of all upcoming events in chronological order

**Features:**
- Events listed by date in order
- Shows time and location for each event
- Compact, easy-to-scan list format
- No time grid, just the facts
- Best for reading through your schedule

**Navigation:**
- Scroll to see upcoming events
- Click any event for full details
- Click a date header to switch to that day's Day view

[Screenshot: Agenda view with event list]

---

## Managing Visibility

### Toggling Calendars On/Off

Each calendar has a checkbox next to its name. Toggle it to show or hide all events from that calendar.

**How to hide a calendar:**
1. Look at the "My Calendars" section in the left sidebar
2. Find the calendar you want to hide
3. Click the **checkbox** next to it to uncheck it
4. Events from that calendar immediately disappear from all views

**How to show a calendar:**
1. Find the unchecked calendar in the list
2. Click the **checkbox** next to it to check it
3. Events reappear immediately

[Screenshot: Visibility toggles in sidebar]

### Use Cases

- **Hide personal events** when sharing your screen during work meetings
- **Hide work events** when you're on personal time
- **Hide old calendars** you're no longer actively using
- **Isolate events** from one calendar for focused time

---

## Color Coding

Every calendar has a unique color to make it easy to identify events at a glance.

### How Color Works

- **Calendar Color**: When you add a calendar, it's assigned a distinct color (e.g., blue, green, red)
- **Event Color**: All events from that calendar display in that color
- **Consistency**: The same calendar always uses the same color across all views

### Color Meanings (Convention)

While you can use any color, here's a suggested scheme:

| Color | Suggested Use |
|-------|--------------|
| 🔵 Blue | Personal calendar |
| 🟢 Green | Work calendar |
| 🔴 Red | Important/Deadline |
| 🟣 Purple | Team/Shared calendar |
| 🟡 Yellow | Travel/Out-of-office |
| 🟠 Orange | Projects |

### Changing Calendar Colors

1. Click the **Settings** icon (⚙️) in "My Calendars"
2. Find the calendar you want to change
3. Click the **color dot** next to its name
4. Choose a new color from the palette
5. Click **Save** — the change applies immediately

---

## Working with Events

### Viewing Event Details

Click any event to open the **Event Details Modal** with full information:

- **Title**: Event name
- **Date & Time**: When the event occurs
- **Location**: Where the event is (if provided)
- **Description**: Full event description
- **Calendar**: Which calendar it belongs to

[Screenshot: Event details modal]

### Event Types

**All-Day Events:**
- Displayed with a diamond symbol (◆) in month/week views
- Shown at the top of the day
- No specific time

**Timed Events:**
- Show the start time (e.g., "3:00 PM Team Standup")
- Appear in the correct time slot
- Include end time in day/week views

### Interacting with Events

**Click to view details:**
- Opens the full event information
- Shows location and description
- Allows editing (if you have permission)

**Hover for preview:**
- In month view, hover over an event to see a tooltip
- In other views, events show all details inline

**Location indicator:**
- Events with a location show a 📍 pin icon
- Click to see the full address

### Creating Events

Use the **+ New Event** button in the sidebar to create a new event. The AI Assistant can also help you create events naturally (see "Tips & Tricks" below).

---

## Navigation Tips

### Keyboard Navigation (When Implemented)

The calendar supports keyboard shortcuts for power users:

| Shortcut | Action |
|----------|--------|
| `←` | Previous period (month/week/day) |
| `→` | Next period (month/week/day) |
| `T` | Jump to today |
| `M` | Switch to month view |
| `W` | Switch to week view |
| `D` | Switch to day view |
| `N` | Switch to next N days view |
| `A` | Switch to agenda view |
| `?` | Show help menu |

*(Note: Keyboard shortcuts are available on supported browsers)*

### Quick Navigation

**Jump to Today:**
1. Click the **Today** button (top-center of calendar)
2. This works in any view

**Move Between Periods:**
1. Use the **← Previous** and **Next →** arrow buttons
2. Step size depends on your view:
   - Month view: moves by month
   - Week view: moves by week
   - Day view: moves by day
   - Next N days: moves by day

**Switch Views:**
1. Click the view tabs at the top: **Month**, **Week**, **Day**, **Next Nd**, **Agenda**
2. Your current date is preserved when switching views

---

## Tips & Tricks

### Using the AI Assistant

The Atlas Calendar includes an **AI Assistant** for natural event creation.

1. Click the **🤖 AI Assistant** button in the sidebar
2. Describe your event in plain English:
   - "Schedule a meeting with Sarah on Friday at 2 PM"
   - "Block off tomorrow for focused work"
   - "Add my dentist appointment next Wednesday at 10 AM"
3. The AI will parse the details and create the event
4. Confirm before it's added

[Screenshot: AI Assistant panel]

### Batch Operations

When managing many calendars:
- **Hide all, then show what you want**: Uncheck all calendars, then check only the ones you need
- **Archive old calendars**: Remove calendars you no longer use
- **Organize by color**: Use color consistently to make scanning easier

### Efficient Week Planning

1. Switch to **Week view**
2. Look for time blocks
3. Identify free time for new events
4. Use the AI Assistant to add blocking time for focused work

### Event Overflow

In Month view, days with 4+ events show "+X more":
- Click the day to switch to Day view
- Or switch to Week view to see all events with time slots

### Syncing Multiple Calendars

The calendar automatically syncs from all sources:
- Google Calendar updates every few minutes
- CalDAV calendars sync on demand and periodically
- Use the **Refresh** button to force an immediate sync

### Sharing Your Calendar

*(Depends on source calendar)*
- **Google Calendar**: Share through Google Calendar settings
- **CalDAV**: Ask your administrator for sharing options

---

## Troubleshooting

### Events Not Appearing

**Problem:** I added a calendar but don't see any events.

**Solutions:**
1. **Check visibility**: Make sure the calendar's checkbox is checked in "My Calendars"
2. **Check date range**: Events might be outside the current view date range
3. **Refresh**: Click the **Refresh** button in the sidebar
4. **Check calendar ID**: Ensure the calendar was set up correctly (no typos in server URL, username, or password)

**If still not working:**
- Go to Settings and re-enter the calendar credentials
- Check that the CalDAV server is online and accessible

### Calendar Sync Delays

**Problem:** I updated an event, but it's not showing in Atlas.

**Solution:**
- Click **Refresh** in the sidebar to manually sync
- Wait a few minutes for automatic sync to complete
- Check your source calendar (Google Calendar / CalDAV) to confirm the event was actually saved

### Authentication Errors

**Problem:** "Invalid credentials" or "Authentication failed"

**Solutions:**
1. **Google Calendar**: Re-authenticate by clicking "Reconnect" in Settings
2. **CalDAV**: 
   - Double-check your username and password
   - Verify the server URL is correct
   - Check that your CalDAV account hasn't been locked
   - Ask your IT admin if the server requires special setup

### Color Not Showing

**Problem:** All events from a calendar appear gray or without color.

**Solution:**
1. Go to Settings
2. Click the color dot for that calendar
3. Choose a new color
4. Refresh the calendar

### Missing Events in Specific View

**Problem:** Events appear in Month view but not in Week view (or vice versa).

**Likely cause:** The event data or time information is malformed.

**Solution:**
- Click the event to see full details
- Check if there's an error message
- Try switching to Agenda view to see all events in a list

### Performance Issues (Slow Loading)

**Problem:** Calendar takes a long time to load with many events.

**Solutions:**
1. **Hide unnecessary calendars** to reduce event count
2. **Use specific view ranges**: Switch to Week or Day view instead of Month
3. **Archive old events**: Move past events to archive calendars
4. **Refresh browser**: Clear cache and reload

---

## FAQ

### General Questions

**Q: How many calendars can I add?**
A: You can add as many calendars as you need. We recommend keeping 5–10 active for performance.

**Q: Can I edit events in Atlas?**
A: Yes, if you have edit permissions on the source calendar. Changes sync back to the original calendar (Google Calendar, CalDAV server, etc.).

**Q: Can I delete events from Atlas?**
A: Yes, if you own the event. Deleted events are removed from the source calendar.

**Q: What happens if I remove a calendar from Atlas?**
A: The calendar is hidden from Atlas, but your events remain in the source calendar (Google Calendar, CalDAV server, etc.). You can add it back anytime.

**Q: Can I access my calendar offline?**
A: No, Atlas requires an internet connection. Cached events may display briefly if offline, but updates require a connection.

---

### Calendar Integration

**Q: Do changes in Google Calendar show up in Atlas?**
A: Yes, automatically within a few minutes. Click Refresh for immediate sync.

**Q: Do changes in Atlas show up in Google Calendar?**
A: Yes, if you have edit permissions. Changes sync back to Google Calendar automatically.

**Q: Can I use multiple Google accounts?**
A: Yes! Each Google account can be added as a separate calendar.

**Q: Is my CalDAV password stored securely?**
A: Yes, passwords are encrypted and stored securely. Never hardcoded or logged.

**Q: What if my CalDAV server goes offline?**
A: Atlas will display cached events, but won't sync new changes until the server is back online.

---

### Views and Navigation

**Q: Why do I see "+3 more" in Month view?**
A: To keep the month view compact, Atlas shows up to 3 events per day. Click the day to see all events in Day view.

**Q: Can I customize the time range in Week/Day views?**
A: Currently, views show 6 AM to 11 PM. This can be customized in Settings.

**Q: How do I export events?**
A: Export functionality comes from your source calendar (Google Calendar exports, CalDAV sync tools).

**Q: Can I print my calendar?**
A: Use your browser's print function (Cmd+P or Ctrl+P). Month view prints best.

---

### AI Assistant

**Q: How does the AI Assistant create events?**
A: Describe an event naturally ("Tomorrow at 3 PM with Sarah"), and the AI parses the details and creates it.

**Q: Can the AI handle complex events?**
A: Yes, including recurring events, time zones, locations, and descriptions. Say it naturally!

**Q: What if the AI misunderstands?**
A: Review the event details before confirming. Make corrections as needed before saving.

---

### Performance & Troubleshooting

**Q: Why is the calendar slow with many events?**
A: Too many events can impact performance. Hide unnecessary calendars or view specific date ranges.

**Q: Will hidden calendars slow things down?**
A: No, hidden calendars don't load events into the interface.

**Q: What if I see duplicates?**
A: Duplicates might mean the calendar was imported twice. Check Settings and remove the duplicate.

**Q: Why aren't my recurring events showing?**
A: Recurring event support depends on your source calendar. Check that recurring events are enabled in Google Calendar or CalDAV.

---

## Getting Help

If you encounter issues not covered here:

1. **Check the troubleshooting section** above
2. **Review your source calendar** (Google Calendar, CalDAV server) to confirm the issue isn't there
3. **Reach out to your administrator** for CalDAV server issues
4. **Contact Atlas support** with:
   - Description of the issue
   - Steps to reproduce
   - Screenshots if helpful
   - Browser and OS information

---

## What's Next?

Now that you know the basics, try:
- ✅ Adding your first calendar (Google or CalDAV)
- ✅ Exploring different views to find your favorite
- ✅ Using the AI Assistant to create an event
- ✅ Customizing calendar colors for quick scanning
- ✅ Setting up the "Next N Days" view for your weekly planning

Happy scheduling! 📅
