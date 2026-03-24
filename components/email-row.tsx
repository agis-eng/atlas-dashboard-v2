import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  htmlBody?: string;
  date: string;
  read: boolean;
  starred: boolean;
  account: string;
}

interface EmailRowProps {
  email: Email;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (email: Email) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}

export function EmailRow({ email, selected, onToggleSelect, onOpen, onDelete, onArchive }: EmailRowProps) {
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    setDeleting(true);
    try {
      await onDelete(email.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    setArchiving(true);
    try {
      await onArchive(email.id);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(email.id)}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 cursor-pointer"
      />
      <div 
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onOpen(email)}
      >
        <div className="flex items-center gap-2 mb-1">
          <p className={cn("font-medium text-sm truncate", !email.read && "font-bold")}>
            {email.subject}
          </p>
          {!email.read && <Badge variant="default" className="text-xs bg-blue-600">New</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{email.from}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{email.snippet}</p>
      </div>
      <div className="flex items-start gap-1">
        <div className="text-xs text-muted-foreground whitespace-nowrap text-right">
          <div>{new Date(email.date).toLocaleDateString()}</div>
          <div className="text-[10px]">{new Date(email.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={archiving}
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleArchive}
          title="Archive"
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={deleting}
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleDelete}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
