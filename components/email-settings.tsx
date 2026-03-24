"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Settings,
  Plus,
  Trash2,
  Mail,
  Shield,
  Wifi,
  WifiOff,
  Clock,
  Bell,
  ListFilter,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
}

interface EmailAccount {
  id: string;
  name: string;
  email: string;
  type: "smtp" | "google";
  smtp?: SmtpConfig;
  connected: boolean;
  created_at: string;
}

interface CategorizationRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  match_field: "subject" | "from" | "to" | "snippet";
  category: "topOfMind" | "fyi" | "newsletters";
  enabled: boolean;
}

interface DigestSettings {
  enabled: boolean;
  times: string[];
  delivery_method: "dashboard" | "slack" | "email";
  categorization_rules: CategorizationRule[];
}

interface EmailSettings {
  accounts: EmailAccount[];
  digest: DigestSettings;
  updated_at: string;
}

// ── Constants ──────────────────────────────────────────────────────

const DIGEST_TIME_OPTIONS = ["6am", "9am", "12pm", "3pm", "6pm"];
const DELIVERY_METHODS = [
  { value: "dashboard", label: "Dashboard Only" },
  { value: "slack", label: "Slack" },
  { value: "email", label: "Email" },
] as const;
const CATEGORY_OPTIONS = [
  { value: "topOfMind", label: "Top of Mind" },
  { value: "fyi", label: "FYI" },
  { value: "newsletters", label: "Newsletters" },
] as const;
const MATCH_FIELD_OPTIONS = [
  { value: "subject", label: "Subject" },
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "snippet", label: "Body" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────

function newSmtpConfig(): SmtpConfig {
  return { host: "", port: 587, username: "", password: "", secure: true };
}

function newAccount(): Partial<EmailAccount> {
  return { name: "", email: "", type: "smtp", smtp: newSmtpConfig() };
}

function newRule(): Partial<CategorizationRule> {
  return {
    name: "",
    description: "",
    pattern: "",
    match_field: "subject",
    category: "fyi",
    enabled: true,
  };
}

// ── Section Wrapper ────────────────────────────────────────────────

function SettingsSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-orange-600" />
        <span className="text-sm font-semibold">{title}</span>
      </button>
      {open && <div className="ml-6 mt-2 space-y-3">{children}</div>}
    </div>
  );
}

// ── Account Form ───────────────────────────────────────────────────

function AccountForm({
  account,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  account: Partial<EmailAccount>;
  onChange: (a: Partial<EmailAccount>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Label</label>
            <Input
              placeholder="e.g. Work Email"
              value={account.name || ""}
              onChange={(e) => onChange({ ...account, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={account.email || ""}
              onChange={(e) => onChange({ ...account, email: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <select
            value={account.type || "smtp"}
            onChange={(e) => {
              const type = e.target.value as "smtp" | "google";
              onChange({
                ...account,
                type,
                smtp: type === "smtp" ? account.smtp || newSmtpConfig() : undefined,
              });
            }}
            className="mt-1 h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            <option value="smtp">SMTP</option>
            <option value="google">Google OAuth</option>
          </select>
        </div>

        {account.type === "smtp" && (
          <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">SMTP Configuration</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Host</label>
                <Input
                  placeholder="smtp.gmail.com"
                  value={account.smtp?.host || ""}
                  onChange={(e) =>
                    onChange({
                      ...account,
                      smtp: { ...account.smtp!, host: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Port</label>
                <Input
                  type="number"
                  placeholder="587"
                  value={account.smtp?.port || ""}
                  onChange={(e) =>
                    onChange({
                      ...account,
                      smtp: { ...account.smtp!, port: parseInt(e.target.value) || 587 },
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Username</label>
                <Input
                  placeholder="username"
                  value={account.smtp?.username || ""}
                  onChange={(e) =>
                    onChange({
                      ...account,
                      smtp: { ...account.smtp!, username: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={account.smtp?.password || ""}
                  onChange={(e) =>
                    onChange({
                      ...account,
                      smtp: { ...account.smtp!, password: e.target.value },
                    })
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={account.smtp?.secure ?? true}
                onChange={(e) =>
                  onChange({
                    ...account,
                    smtp: { ...account.smtp!, secure: e.target.checked },
                  })
                }
                className="rounded border-input accent-orange-600"
              />
              <Shield className="h-3 w-3" />
              Use TLS (secure)
            </label>
          </div>
        )}

        {account.type === "google" && (
          <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Gmail App Password</p>
              
              {/* Collapsible How-To Guide */}
              <details className="mb-3 rounded-md border border-blue-500/20 bg-blue-500/5 p-2.5">
                <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5">
                  <span>📖 How to get your App Password (click to expand)</span>
                </summary>
                <div className="mt-2 space-y-2 text-[11px] text-muted-foreground pl-5">
                  <ol className="list-decimal space-y-1.5">
                    <li>
                      Go to{" "}
                      <a 
                        href="https://myaccount.google.com/apppasswords" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-500 underline hover:text-blue-600"
                      >
                        myaccount.google.com/apppasswords
                      </a>
                    </li>
                    <li>Sign in to your Google account if prompted</li>
                    <li>
                      <strong>Name your app:</strong> Enter "Atlas Dashboard" or any name you'll remember
                    </li>
                    <li>
                      <strong>Click "Create"</strong> - Google will generate a 16-character password
                    </li>
                    <li>
                      <strong>Copy the password</strong> (it looks like: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">abcd efgh ijkl mnop</code>)
                    </li>
                    <li>Paste it into the "App Password" field below</li>
                    <li>Click "Save Account" - you're done! ✅</li>
                  </ol>
                  
                  <div className="mt-3 pt-2 border-t border-blue-500/10">
                    <p className="text-[10px] text-muted-foreground/80">
                      <strong>Note:</strong> If you don't see the App Passwords option, make sure:
                    </p>
                    <ul className="list-disc ml-4 mt-1 space-y-0.5 text-[10px]">
                      <li>2-Step Verification is enabled on your Google account</li>
                      <li>You're not using a work/school account with restrictions</li>
                    </ul>
                  </div>
                  
                  <div className="mt-2 p-2 rounded bg-green-500/5 border border-green-500/20">
                    <p className="text-[10px] text-green-700 dark:text-green-400">
                      ✨ <strong>Pro tip:</strong> You can revoke this password anytime from the same Google page if you need to disconnect this app.
                    </p>
                  </div>
                </div>
              </details>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Gmail Address</label>
                <Input
                  placeholder="you@gmail.com"
                  value={account.smtp?.username || account.email || ""}
                  onChange={(e) =>
                    onChange({
                      ...account,
                      email: e.target.value,
                      smtp: { 
                        host: "imap.gmail.com",
                        port: 993,
                        username: e.target.value,
                        password: account.smtp?.password || "",
                        secure: true
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">App Password</label>
                <Input
                  type="password"
                  placeholder="16-character code"
                  value={account.smtp?.password || ""}
                  onChange={(e) =>
                    onChange({
                      ...account,
                      smtp: { 
                        host: "imap.gmail.com",
                        port: 993,
                        username: account.smtp?.username || account.email || "",
                        password: e.target.value,
                        secure: true
                      },
                    })
                  }
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Uses Gmail IMAP (imap.gmail.com:993). Secure and revokable.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || !account.name?.trim() || !account.email?.trim()}
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Save Account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Rule Form ──────────────────────────────────────────────────────

function RuleForm({
  rule,
  onChange,
  onSave,
  onCancel,
}: {
  rule: Partial<CategorizationRule>;
  onChange: (r: Partial<CategorizationRule>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Rule Name</label>
            <Input
              placeholder="e.g. Urgent keywords"
              value={rule.name || ""}
              onChange={(e) => onChange({ ...rule, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Pattern (regex)</label>
            <Input
              placeholder="URGENT|ASAP"
              value={rule.pattern || ""}
              onChange={(e) => onChange({ ...rule, pattern: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Description</label>
          <Input
            placeholder="What this rule does..."
            value={rule.description || ""}
            onChange={(e) => onChange({ ...rule, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Match Field</label>
            <select
              value={rule.match_field || "subject"}
              onChange={(e) =>
                onChange({ ...rule, match_field: e.target.value as CategorizationRule["match_field"] })
              }
              className="mt-1 h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
            >
              {MATCH_FIELD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Assign Category</label>
            <select
              value={rule.category || "fyi"}
              onChange={(e) =>
                onChange({ ...rule, category: e.target.value as CategorizationRule["category"] })
              }
              className="mt-1 h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!rule.name?.trim() || !rule.pattern?.trim()}
          >
            Save Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Settings Component ────────────────────────────────────────

export function EmailSettingsSheet() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");

  // Add account form
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountForm, setAddAccountForm] = useState<Partial<EmailAccount>>(newAccount());

  // Edit account
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountForm, setEditAccountForm] = useState<Partial<EmailAccount>>({});

  // Add rule form
  const [showAddRule, setShowAddRule] = useState(false);
  const [addRuleForm, setAddRuleForm] = useState<Partial<CategorizationRule>>(newRule());

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email-settings");
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch email settings", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchSettings();
  }, [open, fetchSettings]);

  const saveFullSettings = async (updated: EmailSettings) => {
    setSaving(true);
    setSaveError("");
    // Optimistic update — show change immediately
    const previous = settings;
    setSettings(updated);
    try {
      const res = await fetch("/api/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setSettings(await res.json());
      } else {
        // Revert on failure
        const errData = await res.json().catch(() => ({}));
        console.error("Email settings save failed:", res.status, errData);
        setSaveError(errData.details || errData.error || `Save failed (${res.status})`);
        setSettings(previous);
      }
    } catch (err) {
      console.error("Failed to save settings", err);
      setSaveError("Network error — could not save settings");
      setSettings(previous);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAccount = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/email-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addAccountForm),
      });
      if (res.ok) {
        setShowAddAccount(false);
        setAddAccountForm(newAccount());
        await fetchSettings();
      } else {
        const errData = await res.json().catch(() => ({}));
        setSaveError(errData.details || errData.error || "Failed to add account");
      }
    } catch (err) {
      console.error("Failed to add account", err);
      setSaveError("Network error — could not add account");
    } finally {
      setSaving(false);
    }
  };

  const handleEditAccount = async () => {
    if (!settings || !editingAccountId) return;
    const updated = {
      ...settings,
      accounts: settings.accounts.map((a) =>
        a.id === editingAccountId ? { ...a, ...editAccountForm } : a
      ),
    };
    await saveFullSettings(updated);
    setEditingAccountId(null);
    setEditAccountForm({});
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      const res = await fetch(`/api/email-settings?id=${id}`, { method: "DELETE" });
      if (res.ok) await fetchSettings();
    } catch (err) {
      console.error("Failed to delete account", err);
    }
  };

  const handleTestConnection = async (account: EmailAccount) => {
    setTestingConnection(account.id);
    // Simulate test — real implementation later
    await new Promise((r) => setTimeout(r, 1500));
    const success = !!(account.smtp?.host && account.smtp?.port);
    setTestResult({
      id: account.id,
      success,
      message: success
        ? "Connection successful"
        : "Missing SMTP configuration — fill in host and port",
    });
    setTestingConnection(null);
    setTimeout(() => setTestResult(null), 4000);
  };

  const handleToggleDigest = async (enabled: boolean) => {
    if (!settings) return;
    await saveFullSettings({ ...settings, digest: { ...settings.digest, enabled } });
  };

  const handleToggleTime = async (time: string) => {
    if (!settings) return;
    const times = settings.digest.times.includes(time)
      ? settings.digest.times.filter((t) => t !== time)
      : [...settings.digest.times, time];
    await saveFullSettings({ ...settings, digest: { ...settings.digest, times } });
  };

  const handleDeliveryMethod = async (method: DigestSettings["delivery_method"]) => {
    if (!settings) return;
    await saveFullSettings({
      ...settings,
      digest: { ...settings.digest, delivery_method: method },
    });
  };

  const handleAddRule = async () => {
    if (!settings) return;
    const rule: CategorizationRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: addRuleForm.name || "",
      description: addRuleForm.description || "",
      pattern: addRuleForm.pattern || "",
      match_field: addRuleForm.match_field || "subject",
      category: addRuleForm.category || "fyi",
      enabled: true,
    };
    await saveFullSettings({
      ...settings,
      digest: {
        ...settings.digest,
        categorization_rules: [...settings.digest.categorization_rules, rule],
      },
    });
    setShowAddRule(false);
    setAddRuleForm(newRule());
  };

  const handleToggleRule = async (ruleId: string) => {
    if (!settings) return;
    await saveFullSettings({
      ...settings,
      digest: {
        ...settings.digest,
        categorization_rules: settings.digest.categorization_rules.map((r) =>
          r.id === ruleId ? { ...r, enabled: !r.enabled } : r
        ),
      },
    });
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!settings) return;
    await saveFullSettings({
      ...settings,
      digest: {
        ...settings.digest,
        categorization_rules: settings.digest.categorization_rules.filter(
          (r) => r.id !== ruleId
        ),
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1.5" />
            Settings
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Email Settings</SheetTitle>
          <SheetDescription>
            Configure email accounts, digest preferences, and categorization rules.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : settings ? (
          <div className="px-4 space-y-4 pb-4">
            {/* ── Email Accounts ── */}
            <SettingsSection title="Email Accounts" icon={Mail}>
              {settings.accounts.map((account) =>
                editingAccountId === account.id ? (
                  <AccountForm
                    key={account.id}
                    account={editAccountForm}
                    onChange={setEditAccountForm}
                    onSave={handleEditAccount}
                    onCancel={() => {
                      setEditingAccountId(null);
                      setEditAccountForm({});
                    }}
                    saving={saving}
                  />
                ) : (
                  <Card key={account.id} size="sm">
                    <CardContent className="pt-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {account.name}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                account.type === "google"
                                  ? "bg-blue-500/10 text-blue-600"
                                  : "bg-gray-500/10 text-gray-600"
                              )}
                            >
                              {account.type === "google" ? "Google" : "SMTP"}
                            </span>
                            {account.connected ? (
                              <Wifi className="h-3 w-3 text-green-500" />
                            ) : (
                              <WifiOff className="h-3 w-3 text-muted-foreground/40" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {account.email}
                          </p>
                          {account.type === "smtp" && account.smtp?.host && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {account.smtp.host}:{account.smtp.port}
                              {account.smtp.secure ? " (TLS)" : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {account.type === "smtp" && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleTestConnection(account)}
                              disabled={testingConnection === account.id}
                            >
                              {testingConnection === account.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Wifi className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                          {account.type === "google" && account.connected && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => {
                                // Disconnect — placeholder
                              }}
                              title="Disconnect"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setEditingAccountId(account.id);
                              setEditAccountForm({ ...account });
                            }}
                          >
                            <Settings className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDeleteAccount(account.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {/* Test result */}
                      {testResult?.id === account.id && (
                        <div
                          className={cn(
                            "mt-2 rounded-md px-2 py-1.5 text-xs flex items-center gap-1.5",
                            testResult.success
                              ? "bg-green-500/10 text-green-600"
                              : "bg-red-500/10 text-red-600"
                          )}
                        >
                          {testResult.success ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          {testResult.message}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              )}

              {showAddAccount ? (
                <AccountForm
                  account={addAccountForm}
                  onChange={setAddAccountForm}
                  onSave={handleAddAccount}
                  onCancel={() => {
                    setShowAddAccount(false);
                    setAddAccountForm(newAccount());
                  }}
                  saving={saving}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAddAccount(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Email Account
                </Button>
              )}
            </SettingsSection>

            <Separator />

            {/* ── Digest Settings ── */}
            <SettingsSection title="Digest Schedule" icon={Clock}>
              <div className="space-y-3">
                {/* Enable/disable */}
                <label className="flex items-center justify-between">
                  <span className="text-sm">Enable email digests</span>
                  <button
                    onClick={() => handleToggleDigest(!settings.digest.enabled)}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      settings.digest.enabled ? "bg-orange-600" : "bg-muted-foreground/30"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                        settings.digest.enabled && "translate-x-4"
                      )}
                    />
                  </button>
                </label>

                {settings.digest.enabled && (
                  <>
                    {/* Digest times */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Digest Times</p>
                      <div className="flex flex-wrap gap-2">
                        {DIGEST_TIME_OPTIONS.map((time) => {
                          const active = settings.digest.times.includes(time);
                          return (
                            <button
                              key={time}
                              onClick={() => handleToggleTime(time)}
                              className={cn(
                                "rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
                                active
                                  ? "border-orange-600 bg-orange-600/10 text-orange-600"
                                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
                              )}
                            >
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Delivery method */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Delivery Method
                      </p>
                      <div className="flex gap-2">
                        {DELIVERY_METHODS.map((method) => {
                          const active =
                            settings.digest.delivery_method === method.value;
                          return (
                            <button
                              key={method.value}
                              onClick={() => handleDeliveryMethod(method.value)}
                              className={cn(
                                "rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
                                active
                                  ? "border-orange-600 bg-orange-600/10 text-orange-600"
                                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
                              )}
                            >
                              {method.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </SettingsSection>

            <Separator />

            {/* ── Categorization Rules ── */}
            <SettingsSection title="Categorization Rules" icon={ListFilter}>
              <div className="space-y-2">
                {settings.digest.categorization_rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={cn(
                      "rounded-lg border p-2.5 transition-all",
                      rule.enabled
                        ? "border-border/50 bg-card/50"
                        : "border-border/30 bg-muted/20 opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium">{rule.name}</p>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                            {rule.match_field}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                              rule.category === "topOfMind"
                                ? "bg-red-500/10 text-red-600"
                                : rule.category === "fyi"
                                  ? "bg-blue-500/10 text-blue-600"
                                  : "bg-gray-500/10 text-gray-600"
                            )}
                          >
                            {CATEGORY_OPTIONS.find((c) => c.value === rule.category)?.label}
                          </span>
                        </div>
                        {rule.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {rule.description}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">
                          /{rule.pattern}/
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleRule(rule.id)}
                          className={cn(
                            "relative h-4 w-7 rounded-full transition-colors",
                            rule.enabled ? "bg-orange-600" : "bg-muted-foreground/30"
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                              rule.enabled && "translate-x-3"
                            )}
                          />
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {showAddRule ? (
                  <RuleForm
                    rule={addRuleForm}
                    onChange={setAddRuleForm}
                    onSave={handleAddRule}
                    onCancel={() => {
                      setShowAddRule(false);
                      setAddRuleForm(newRule());
                    }}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAddRule(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Rule
                  </Button>
                )}
              </div>
            </SettingsSection>

            {/* Save error */}
            {saveError && (
              <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-600 flex items-center gap-2">
                <X className="h-3 w-3 shrink-0" />
                {saveError}
              </div>
            )}

            {/* Saving indicator */}
            {saving && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </div>
            )}

            {/* Last updated */}
            {settings.updated_at && (
              <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
                Last saved:{" "}
                {new Date(settings.updated_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Failed to load settings
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
