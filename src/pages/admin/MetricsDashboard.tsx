import { useEffect, useState, useCallback } from 'react';
import { useGoogleAuth } from '../../contexts/GoogleAuthContext';
import { Activity, Clock, Database, ServerCrash, Server, RefreshCw } from 'lucide-react';

interface MetricsData {
  system: {
    requests: { total: number; errors: string; avgLatencyMs: number };
    database: { slowQueries: number };
    queue: { avgWaitTimeMs: number; avgProcessingTimeMs: number };
  };
  queueStatus: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  timestamp: string;
}

export default function MetricsDashboard() {
  const { getToken } = useGoogleAuth();
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      const res = await fetch('/api/admin/metrics', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch metrics (' + res.status + ')');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Polling every 5s
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (error) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex flex-col items-center justify-center h-full text-center">
        <ServerCrash className="text-destructive mb-4" size={48} />
        <h2 className="text-xl font-bold">Failed to load metrics</h2>
        <p className="text-muted-foreground">{error}</p>
        <button onClick={fetchMetrics} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Retry Connection</button>
      </div>
    );
  }

  if (!data && loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Health</h1>
          <p className="text-sm text-muted-foreground">Real-time metrics for API, Queue, and Database</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/50 px-3 py-1.5 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Live updating ({new Date(data.timestamp).toLocaleTimeString()})
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* System Health Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-primary font-medium mb-4">
            <Activity size={18} /> API Layer
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Total Requests</p>
              <p className="text-2xl font-bold">{data.system.requests.total}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Avg Latency</p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${data.system.requests.avgLatencyMs > 500 ? 'bg-destructive' : data.system.requests.avgLatencyMs > 200 ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <p className={`text-lg font-semibold ${data.system.requests.avgLatencyMs > 500 ? 'text-destructive' : data.system.requests.avgLatencyMs > 200 ? 'text-amber-500' : 'text-green-500'}`}>
                    {data.system.requests.avgLatencyMs}ms
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Error Rate</p>
                <p className={`text-lg font-semibold ${parseFloat(data.system.requests.errors) > 5 ? 'text-destructive' : parseFloat(data.system.requests.errors) > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                  {data.system.requests.errors}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Database Health */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-blue-500 font-medium mb-4">
            <Database size={18} /> Database
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase">Slow Queries (&gt;200ms)</p>
              <div className="flex items-end gap-2">
                <p className={`text-4xl font-bold ${data.system.database.slowQueries > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                  {data.system.database.slowQueries}
                </p>
                <p className="text-sm text-muted-foreground pb-1">captured</p>
              </div>
            </div>
          </div>
        </div>

        {/* Background Jobs Output */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 text-purple-500 font-medium mb-4">
            <Server size={18} /> Queue Jobs
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Waiting Jobs</p>
                <p className="text-2xl font-bold">{data.queueStatus.waiting}</p>
             </div>
             <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Active Worker</p>
                <p className="text-2xl font-bold text-primary">{data.queueStatus.active}</p>
             </div>
             <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Completed</p>
                <p className="text-lg font-semibold text-green-500">{data.queueStatus.completed}</p>
             </div>
             <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Failed</p>
                <p className={`text-lg font-semibold ${data.queueStatus.failed > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {data.queueStatus.failed}
                </p>
             </div>
          </div>
        </div>
      </div>

      {/* Queue Performance Deep Dive */}
      <h2 className="text-lg font-semibold mt-8 mb-2 border-b border-border pb-2">AI Queue Performance</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div className="bg-accent/30 border border-border rounded-xl p-5 flex items-center justify-between">
           <div>
             <p className="text-sm text-muted-foreground font-medium">Average Wait Time</p>
             <p className="text-[10px] text-muted-foreground">Time job sat in Redis queue</p>
           </div>
           <div className="flex items-center gap-2">
             <Clock size={20} className="text-amber-500" />
             <p className="text-2xl font-bold">{data.system.queue.avgWaitTimeMs}ms</p>
           </div>
         </div>
         
         <div className="bg-accent/30 border border-border rounded-xl p-5 flex items-center justify-between">
           <div>
             <p className="text-sm text-muted-foreground font-medium">Average Processing Time</p>
             <p className="text-[10px] text-muted-foreground">Time worker spent generating AI section</p>
           </div>
           <div className="flex items-center gap-2">
             <Server size={20} className="text-primary" />
             <p className="text-2xl font-bold">{(data.system.queue.avgProcessingTimeMs / 1000).toFixed(1)}s</p>
           </div>
         </div>
      </div>
      
    </div>
  );
}
