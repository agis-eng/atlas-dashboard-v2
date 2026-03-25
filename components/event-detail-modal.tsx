"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, FileText, X } from "lucide-react";

interface EventDetailModalProps {
  event: any;
  onClose: () => void;
  onUpdate: () => void;
}

export function EventDetailModal({ event, onClose, onUpdate }: EventDetailModalProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div 
                className="w-1 h-16 rounded-full flex-shrink-0"
                style={{ backgroundColor: event.color }}
              />
              <div className="flex-1">
                <DialogTitle className="text-xl">{event.title}</DialogTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  {formatDate(event.start)}
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <div className="text-sm">
                {event.allDay ? (
                  <span>All day</span>
                ) : (
                  <span>
                    {formatTime(event.start)} - {formatTime(event.end)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Calendar */}
          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <div className="text-sm flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: event.color }}
                />
                <span>Calendar</span>
              </div>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <div className="text-sm">{event.location}</div>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <div className="text-sm whitespace-pre-wrap">{event.description}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" disabled>
            Edit
          </Button>
          <Button variant="outline" disabled>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
