"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Settings,
  Bot,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { CalendarView } from "@/components/calendar-view";
import { CalendarAI } from "@/components/calendar-ai";
import { CalendarSettings } from "@/components/calendar-settings";
import { EventDetailModal } from "@/components/event-detail-modal";

type ViewMode = "month" | "week" | "day" | "agenda" | "next";

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAI, setShowAI] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventModalMode, setEventModalMode] = useState<"view" | "create">("view");
  const [nextDays, setNextDays] = useState(3); // For "next N days" view

  useEffect(() => {
    loadCalendars();
    loadEvents();
  }, [currentDate]);

  async function loadCalendars() {
    try {
      const res = await fetch('/api/calendar/calendars');
      if (res.ok) {
        const data = await res.json();
        setCalendars(data.calendars || []);
      }
    } catch (err) {
      console.error('Failed to load calendars:', err);
    }
  }

  async function loadEvents() {
    setLoading(true);
    try {
      console.log('[Calendar] Fetching events...');
      const res = await fetch('/api/calendar/events');
      console.log('[Calendar] Response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[Calendar] Events loaded:', data.events?.length || 0);
        setEvents(data.events || []);
      } else {
        const error = await res.text();
        console.error('[Calendar] Failed to load events:', error);
      }
    } catch (err) {
      console.error('[Calendar] Error loading events:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleCalendarVisibility(calendarId: string) {
    setCalendars(calendars.map(cal => 
      cal.id === calendarId 
        ? { ...cal, visible: !cal.visible }
        : cal
    ));
    
    // Persist to backend
    fetch('/api/calendar/calendars', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: calendarId,
        visible: !calendars.find(c => c.id === calendarId)?.visible
      })
    });
  }

  function navigateDate(direction: 'prev' | 'next' | 'today') {
    const newDate = new Date(currentDate);
    
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    switch (view) {
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        break;
      case 'week':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        break;
      case 'day':
      case 'next':
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        break;
    }
    
    setCurrentDate(newDate);
  }

  const formatCurrentDate = () => {
    if (view === 'next') {
      return `Next ${nextDays} Days`;
    }
    
    const options: Intl.DateTimeFormatOptions = 
      view === 'month' 
        ? { month: 'long', year: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' };
    
    return currentDate.toLocaleDateString('en-US', options);
  };

  function openCreateEvent(date?: Date) {
    const start = date ? new Date(date) : new Date();
    start.setMinutes(0, 0, 0);
    if (!date) {
      start.setHours(start.getHours() + 1);
    }

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    const fallbackCalendar = calendars.find((calendar) => calendar.visible) || calendars[0];

    setSelectedEvent({
      id: '',
      title: '',
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      location: '',
      description: '',
      calendarId: fallbackCalendar?.id || 'local-primary',
      color: fallbackCalendar?.color || '#3b82f6',
    });
    setEventModalMode('create');
  }

  async function moveEvent(event: any, start: Date, end: Date) {
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...event,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to move event');
      }

      await loadEvents();
    } catch (err) {
      console.error('Failed to move event:', err);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-6">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6" />
            Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage events
          </p>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <Button 
            className="w-full justify-start" 
            size="sm"
            onClick={() => openCreateEvent()}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Button>
          
          <Button
            variant="outline"
            className="w-full justify-start"
            size="sm"
            onClick={() => setShowAI(!showAI)}
          >
            <Bot className="h-4 w-4 mr-2" />
            AI Assistant
          </Button>
        </div>

        {/* Calendars List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">My Calendars</CardTitle>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {calendars.map((calendar) => (
              <div
                key={calendar.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={calendar.visible}
                  onCheckedChange={() => toggleCalendarVisibility(calendar.id)}
                  className="data-[state=checked]:bg-current data-[state=checked]:border-current"
                  style={{ color: calendar.color }}
                />
                <div 
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: calendar.color }}
                />
                <span className="text-sm flex-1 truncate">{calendar.name}</span>
              </div>
            ))}
            
            {calendars.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                No calendars yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            loadCalendars();
            loadEvents();
          }}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
        {/* AI Assistant Sidebar */}
        {showAI && (
          <CalendarAI 
            onClose={() => setShowAI(false)}
            onEventCreated={() => loadEvents()}
          />
        )}

        {/* Settings Modal */}
        {showSettings && (
          <CalendarSettings
            calendars={calendars}
            onClose={() => {
              setShowSettings(false);
              loadCalendars();
            }}
            onCalendarsUpdated={() => {
              loadCalendars();
              loadEvents();
            }}
          />
        )}

        {/* Event Detail Modal */}
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            calendars={calendars}
            mode={eventModalMode}
            onClose={() => {
              setSelectedEvent(null);
              setEventModalMode('view');
            }}
            onUpdate={() => {
              loadEvents();
              setSelectedEvent(null);
              setEventModalMode('view');
            }}
          />
        )}

        {/* Calendar Card */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              {/* View Tabs */}
              <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
                {(['month', 'week', 'day', 'next', 'agenda'] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`
                      px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize
                      ${view === v 
                        ? 'bg-background text-foreground shadow-sm' 
                        : 'text-muted-foreground hover:text-foreground'
                      }
                    `}
                  >
                    {v === 'next' ? `Next ${nextDays}d` : v}
                  </button>
                ))}
                
                {view === 'next' && (
                  <Select
                    value={nextDays.toString()}
                    onValueChange={(val) => {
                      if (val) setNextDays(parseInt(val, 10));
                    }}
                  >
                    <SelectTrigger className="w-16 h-7 text-xs ml-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7].map(n => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Date Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateDate('today')}
                >
                  Today
                </Button>
                
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => navigateDate('prev')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="min-w-[200px] text-center text-sm font-medium">
                    {formatCurrentDate()}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => navigateDate('next')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <CalendarView
                view={view}
                date={currentDate}
                events={events}
                calendars={calendars}
                onEventClick={(event) => {
                  setSelectedEvent(event);
                  setEventModalMode('view');
                }}
                onDateClick={(date) => openCreateEvent(date)}
                onEventMove={moveEvent}
                nextDays={view === 'next' ? nextDays : undefined}
              />
            )}
          </CardContent>
        </Card>

        {!showAI && (
          <Button
            className="fixed bottom-6 right-6 rounded-full shadow-lg z-40 h-12 w-12 p-0"
            onClick={() => setShowAI(true)}
            aria-label="Open AI assistant"
          >
            <Bot className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
