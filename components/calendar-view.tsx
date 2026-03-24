"use client";

import { useMemo } from "react";

type ViewMode = "month" | "week" | "day" | "agenda";

interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color?: string;
  description?: string;
  location?: string;
}

interface Calendar {
  id: string;
  name: string;
  color: string;
  visible: boolean;
}

interface CalendarViewProps {
  view: ViewMode;
  date: Date;
  events: CalendarEvent[];
  calendars: Calendar[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
}

export function CalendarView({
  view,
  date,
  events,
  calendars,
  onEventClick,
  onDateClick,
}: CalendarViewProps) {
  // Filter to visible calendars only
  const visibleEvents = useMemo(() => {
    const visibleCalIds = new Set(calendars.filter(c => c.visible).map(c => c.id));
    const filtered = events.filter(e => visibleCalIds.has(e.calendarId));
    console.log('[CalendarView] Total events:', events.length, 'Visible:', filtered.length, 'Calendars:', calendars.length);
    return filtered;
  }, [events, calendars]);

  if (view === "month") {
    return <MonthView date={date} events={visibleEvents} onEventClick={onEventClick} onDateClick={onDateClick} />;
  }

  if (view === "week") {
    return <WeekView date={date} events={visibleEvents} onEventClick={onEventClick} onDateClick={onDateClick} />;
  }

  if (view === "day") {
    return <DayView date={date} events={visibleEvents} onEventClick={onEventClick} onDateClick={onDateClick} />;
  }

  return <AgendaView events={visibleEvents} onEventClick={onEventClick} />;
}

// Month View Component
function MonthView({ date, events, onEventClick, onDateClick }: any) {
  const { days, weeks } = useMemo(() => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days: Date[] = [];
    const current = new Date(startDate);
    
    while (current <= lastDay || current.getDay() !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    
    return { days, weeks };
  }, [date]);

  function getEventsForDay(day: Date) {
    return events.filter((e: CalendarEvent) => {
      const eventStart = new Date(e.start);
      return (
        eventStart.getDate() === day.getDate() &&
        eventStart.getMonth() === day.getMonth() &&
        eventStart.getFullYear() === day.getFullYear()
      );
    });
  }

  const isToday = (day: Date) => {
    const today = new Date();
    return (
      day.getDate() === today.getDate() &&
      day.getMonth() === today.getMonth() &&
      day.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentMonth = (day: Date) => {
    return day.getMonth() === date.getMonth();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {weeks.map((week, weekIdx) => (
          week.map((day, dayIdx) => {
            const dayEvents = getEventsForDay(day);
            const today = isToday(day);
            const currentMonth = isCurrentMonth(day);

            return (
              <div
                key={`${weekIdx}-${dayIdx}`}
                onClick={() => onDateClick(day)}
                className={`
                  min-h-[120px] border-b border-r p-2 cursor-pointer hover:bg-muted/50 transition-colors
                  ${!currentMonth ? 'bg-muted/20 text-muted-foreground' : ''}
                  ${weekIdx === weeks.length - 1 ? 'border-b-0' : ''}
                  ${dayIdx === 6 ? 'border-r-0' : ''}
                `}
              >
                <div className={`
                  text-sm font-medium mb-1
                  ${today ? 'w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center' : ''}
                `}>
                  {day.getDate()}
                </div>

                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map((event: CalendarEvent) => (
                    <button
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className="w-full text-left px-2 py-1 rounded text-xs font-medium truncate hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: event.color || '#3b82f6',
                        color: 'white',
                      }}
                    >
                      {event.allDay ? '◆ ' : new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' '}
                      {event.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-muted-foreground px-2">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}

// Week View Component
function WeekView({ date, events, onEventClick, onDateClick }: any) {
  const days = useMemo(() => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      return day;
    });
  }, [date]);

  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6am to 11pm

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-8 border-b bg-muted/30">
        <div className="p-2" /> {/* Empty corner */}
        {days.map((day) => (
          <div key={day.toISOString()} className="p-2 text-center">
            <div className="text-xs text-muted-foreground">
              {day.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="text-sm font-medium">
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-8 max-h-[600px] overflow-y-auto">
        {hours.map((hour) => (
          <>
            <div key={`hour-${hour}`} className="p-2 text-xs text-muted-foreground text-right border-r">
              {hour % 12 || 12}{hour >= 12 ? 'pm' : 'am'}
            </div>
            {days.map((day) => (
              <div
                key={`${day.toISOString()}-${hour}`}
                onClick={() => onDateClick(day)}
                className="border-b border-r p-1 min-h-[60px] cursor-pointer hover:bg-muted/50 relative"
              >
                {/* Events in this slot */}
                {events
                  .filter((e: CalendarEvent) => {
                    const eventStart = new Date(e.start);
                    const slotStart = new Date(day);
                    slotStart.setHours(hour, 0, 0, 0);
                    const slotEnd = new Date(slotStart);
                    slotEnd.setHours(hour + 1, 0, 0, 0);
                    
                    return eventStart >= slotStart && eventStart < slotEnd;
                  })
                  .map((event: CalendarEvent) => (
                    <button
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className="w-full text-left px-2 py-1 rounded text-xs font-medium mb-1 hover:opacity-80"
                      style={{
                        backgroundColor: event.color || '#3b82f6',
                        color: 'white',
                      }}
                    >
                      <div className="truncate">{event.title}</div>
                      <div className="text-[10px] opacity-90">
                        {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </button>
                  ))}
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

// Day View Component  
function DayView({ date, events, onEventClick }: any) {
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);
  
  return (
    <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
      {hours.map((hour) => (
        <div key={hour} className="flex border-b">
          <div className="w-20 p-2 text-xs text-muted-foreground text-right border-r">
            {hour % 12 || 12}{hour >= 12 ? 'pm' : 'am'}
          </div>
          <div className="flex-1 p-2 min-h-[80px]">
            {events
              .filter((e: CalendarEvent) => {
                const eventStart = new Date(e.start);
                return eventStart.getHours() === hour;
              })
              .map((event: CalendarEvent) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left px-3 py-2 rounded mb-2 hover:opacity-80"
                  style={{
                    backgroundColor: event.color || '#3b82f6',
                    color: 'white',
                  }}
                >
                  <div className="font-medium">{event.title}</div>
                  <div className="text-xs opacity-90">
                    {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {' - '}
                    {new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  {event.location && (
                    <div className="text-xs opacity-75 mt-1">📍 {event.location}</div>
                  )}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Agenda View Component
function AgendaView({ events, onEventClick }: any) {
  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    
    events.forEach((event: CalendarEvent) => {
      const date = new Date(event.start).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
    });
    
    return groups;
  }, [events]);

  return (
    <div className="space-y-4 max-h-[600px] overflow-y-auto p-4">
      {Object.entries(groupedEvents).length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No upcoming events</p>
      ) : (
        Object.entries(groupedEvents).map(([date, dateEvents]) => (
          <div key={date}>
            <h3 className="text-sm font-semibold mb-2 sticky top-0 bg-background py-2 border-b">
              {date}
            </h3>
            <div className="space-y-2">
              {dateEvents.map((event: CalendarEvent) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left p-3 rounded-lg border hover:border-muted-foreground/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-1 h-full rounded-full"
                      style={{ backgroundColor: event.color || '#3b82f6' }}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {event.allDay ? (
                          'All day'
                        ) : (
                          <>
                            {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {' - '}
                            {new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </>
                        )}
                      </div>
                      {event.location && (
                        <div className="text-xs text-muted-foreground mt-1">📍 {event.location}</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
