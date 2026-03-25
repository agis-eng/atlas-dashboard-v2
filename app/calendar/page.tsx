"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type ViewMode = "month" | "week" | "day" | "agenda";

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        break;
    }
    
    setCurrentDate(newDate);
  }

  const formatCurrentDate = () => {
    const options: Intl.DateTimeFormatOptions = 
      view === 'month' 
        ? { month: 'long', year: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' };
    
    return currentDate.toLocaleDateString('en-US', options);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6" />
            Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage your scheduled events
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
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
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAI(!showAI)}
          >
            <Bot className="h-4 w-4 mr-2" />
            AI Assistant
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Button>
        </div>
      </div>

      {/* AI Assistant Sidebar */}
      {showAI && (
        <CalendarAI 
          onClose={() => setShowAI(false)}
          onEventCreated={() => loadEvents()}
        />
      )}

      {/* Main Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            {/* View Tabs */}
            <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
              {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((v) => (
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
                  {v}
                </button>
              ))}
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

        <CardContent>
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
              onEventClick={(event) => console.log('Event clicked:', event)}
              onDateClick={(date) => console.log('Date clicked:', date)}
            />
          )}
        </CardContent>
      </Card>

      {/* Calendar Settings Modal */}
      {showSettings && (
        <CalendarSettings
          calendars={calendars}
          onClose={() => setShowSettings(false)}
          onCalendarsUpdated={() => loadCalendars()}
        />
      )}

      {/* Floating AI Button */}
      {!showAI && (
        <button
          onClick={() => setShowAI(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-purple-600 text-white shadow-2xl hover:bg-purple-700 transition-all hover:scale-110 z-40 flex items-center justify-center"
          aria-label="Open AI Assistant"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
