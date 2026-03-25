"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Server,
  Users,
  AlertTriangle,
  HardDrive,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface HealthCheck {
  name: string;
  status: 'ok' | 'error' | 'warning';
  code?: number;
  error?: string;
  responseTime?: number;
}

interface MonitoringData {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'down';
  checks: HealthCheck[];
  redis?: {
    status: 'connected' | 'disconnected';
    latency?: number;
  };
  backup?: {
    lastTime: string;
    status: 'success' | 'failed' | 'pending';
  };
  users?: {
    active: number;
    total: number;
  };
  errors?: Array<{
    timestamp: string;
    message: string;
    severity: 'critical' | 'warning' | 'info';
  }>;
}

const StatusIcon = ({ status }: { status: 'healthy' | 'degraded' | 'down' }) => {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="w-6 h-6 text-green-500" />;
    case 'degraded':
      return <AlertCircle className="w-6 h-6 text-yellow-500" />;
    case 'down':
      return <AlertCircle className="w-6 h-6 text-red-500" />;
  }
};

const StatusDot = ({ status }: { status: 'ok' | 'error' | 'warning' }) => {
  const colors = {
    ok: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />;
};

const StatusBadge = ({ status }: { status: 'healthy' | 'degraded' | 'down' }) => {
  const variants: Record<string, any> = {
    healthy: { variant: "default", text: "Healthy", bg: "bg-green-500/10 text-green-600 border-green-500/20" },
    degraded: { variant: "secondary", text: "Degraded", bg: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
    down: { variant: "destructive", text: "Down", bg: "bg-red-500/10 text-red-600 border-red-500/20" },
  };
  const config = variants[status];
  return (
    <Badge variant="outline" className={config.bg}>
      {config.text}
    </Badge>
  );
};

export default function MonitorPage() {
  const router = useRouter();
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshIntervalRef = useRef<NodeJS.Timeout>();

  // Check admin status on mount
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        // If we can call /api/health, user is authenticated
        // For now, we'll assume Erik is admin. In production, check session.profile
        const session = await fetch('/api/session').catch(() => null);
        if (session?.ok) {
          const sessionData = await session.json();
          setIsAdmin(sessionData.profile === 'erik');
        } else {
          // Assume Erik (default admin)
          setIsAdmin(true);
        }
      } catch (err) {
        console.error('Admin check failed:', err);
        router.push('/login');
      }
    };
    checkAdmin();
  }, [router]);

  const fetchHealth = async () => {
    try {
      const startTime = Date.now();
      const res = await fetch('/api/health');
      const responseTime = Date.now() - startTime;

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (!res.ok) {
        throw new Error(`Health check failed: ${res.statusText}`);
      }

      const healthData = await res.json();
      
      // Enrich with additional metadata
      const monitoringData: MonitoringData = {
        ...healthData,
        timestamp: new Date().toISOString(),
        redis: healthData.redis || {
          status: healthData.checks?.find((c: HealthCheck) => c.name === 'Redis')?.status === 'ok' 
            ? 'connected' 
            : 'disconnected',
        },
        errors: healthData.errors || [
          // Mock error entries if none exist
          ...(healthData.status !== 'healthy' ? [{
            timestamp: new Date().toISOString(),
            message: 'System status is ' + healthData.status,
            severity: healthData.status === 'down' ? 'critical' as const : 'warning' as const,
          }] : [])
        ],
      };

      setData(monitoringData);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch health data:', err);
      toast.error("Failed to fetch system health", {
        description: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchHealth();
  }, []);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      return;
    }

    refreshIntervalRef.current = setInterval(() => {
      fetchHealth();
    }, 30000); // 30 seconds

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Activity className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading system health...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Only administrators can view the monitoring dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const criticalIssues = data?.errors?.filter(e => e.severity === 'critical') || [];
  const warnings = data?.errors?.filter(e => e.severity === 'warning') || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Health Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time infrastructure status and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground text-right">
            {lastRefresh && (
              <>
                <p>Last updated</p>
                <p className="font-mono text-xs">
                  {lastRefresh.toLocaleTimeString()}
                </p>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHealth()}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Status Card */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <StatusIcon status={data?.status || 'down'} />
            <div>
              <CardTitle>Overall System Status</CardTitle>
              <CardDescription>
                Last check {lastRefresh ? `${Math.round((Date.now() - lastRefresh.getTime()) / 1000)}s ago` : 'never'}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={data?.status || 'down'} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-2xl font-bold capitalize">{data?.status || 'unknown'}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Timestamp</p>
              <p className="text-sm font-mono">
                {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '-'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Auto-Refresh</p>
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="gap-2"
              >
                <Zap className="w-4 h-4" />
                {autoRefresh ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical Alerts */}
      {criticalIssues.length > 0 && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Critical Issues ({criticalIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {criticalIssues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-background rounded-lg border border-red-500/20">
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-600">{issue.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(issue.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-5 h-5" />
              Warnings ({warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {warnings.map((warning, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-background rounded-lg border border-yellow-500/20">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-yellow-600">{warning.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(warning.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            API Endpoints
          </CardTitle>
          <CardDescription>
            Response times and status for core services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data?.checks?.map((check: HealthCheck, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <StatusDot status={check.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{check.name}</p>
                    {check.error && (
                      <p className="text-xs text-red-500 mt-0.5">{check.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {check.responseTime && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {check.responseTime}ms
                    </span>
                  )}
                  {check.code && (
                    <Badge variant="outline" className="text-xs">
                      {check.code}
                    </Badge>
                  )}
                  <Badge
                    variant={check.status === 'ok' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {check.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Infrastructure Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Redis */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">Redis Cache</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <StatusDot status={data?.redis?.status === 'connected' ? 'ok' : 'error'} />
              <span className="text-2xl font-bold capitalize">
                {data?.redis?.status || 'unknown'}
              </span>
            </div>
            {data?.redis?.latency && (
              <p className="text-xs text-muted-foreground">
                Latency: <span className="font-mono">{data.redis.latency}ms</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Last Backup */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">Last Backup</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data?.backup?.lastTime && (
                <>
                  <div className="flex items-center gap-3">
                    <StatusDot 
                      status={data.backup.status === 'success' ? 'ok' : data.backup.status === 'failed' ? 'error' : 'warning'} 
                    />
                    <span className="text-sm font-medium capitalize">
                      {data.backup.status || 'pending'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {new Date(data.backup.lastTime).toLocaleDateString()} {' '}
                    {new Date(data.backup.lastTime).toLocaleTimeString()}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {data?.users?.active ?? '-'}
              </div>
              {data?.users?.total && (
                <p className="text-xs text-muted-foreground">
                  of {data.users.total} total users
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Errors/Warnings */}
      {data?.errors && data.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Recent Issues
            </CardTitle>
            <CardDescription>
              Last {data.errors.length} system errors and warnings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.errors.slice(0, 5).map((error, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border"
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      error.severity === 'critical'
                        ? 'bg-red-500'
                        : error.severity === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground break-words">{error.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(error.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs capitalize flex-shrink-0"
                  >
                    {error.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center pt-4 pb-8 text-xs text-muted-foreground">
        <Clock className="w-4 h-4 mr-2" />
        Dashboard auto-refreshes every 30 seconds
      </div>
    </div>
  );
}
