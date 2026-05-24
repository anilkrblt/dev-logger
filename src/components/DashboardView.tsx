import React, { useState, useMemo, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Activity, 
  AlertCircle, 
  Search, 
  Filter,
  Info,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { LogEntry } from '../types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function DashboardView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    // Connect to WebSockets
    const socket: Socket = io('http://localhost:3000', {
      reconnectionAttempts: 5,
      timeout: 5000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('new_log', (newLog: LogEntry) => {
      setLogs((prevLogs) => [newLog, ...prevLogs].slice(0, 500)); // Keep max 500 logs
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const filteredLogs = useMemo(() => {
    let result = logs.filter((log) => {
      const matchesSearch = log.processName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'ALL' || log.type === selectedType;
      return matchesSearch && matchesType;
    });

    result = result.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [logs, searchQuery, selectedType, sortOrder]);

  // Metrics calculation
  const totalLogs = logs.length;
  const errorLogs = logs.filter(l => l.type === 'ERROR' || l.type === 'RULE_FAIL').length;
  const successLogs = logs.filter(l => l.type === 'SUCCESS').length;

  const getCustomBadgeClasses = (type: string) => {
    switch (type) {
      case 'ERROR':
      case 'RULE_FAIL':
        return 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20';
      case 'SUCCESS':
        return 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20';
      case 'UI_EVENT':
        return 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border-purple-500/20';
      case 'INFO':
      default:
        return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20';
    }
  };

  const handleRowClick = (log: LogEntry) => {
    setSelectedLog(log);
    setIsSheetOpen(true);
  };

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString('sv-SE', { 
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-8 font-sans">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Live Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time log events from React Native App</p>
        </div>
        <div className="flex items-center">
          <Badge variant="outline" className={`py-1.5 px-3 flex items-center gap-2 ${isConnected ? 'bg-green-500/10 text-green-600 border-green-500/30' : 'bg-red-500/10 text-red-600 border-red-500/30'}`}>
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>
      </header>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Logs</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLogs}</div>
            <p className="text-xs text-muted-foreground">In the current session</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed Operations</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{errorLogs}</div>
            <p className="text-xs text-muted-foreground">ERROR & RULE_FAIL</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Successful Operations</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{successLogs}</div>
            <p className="text-xs text-muted-foreground">SUCCESS</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border border-border mt-6">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search process name..." 
            className="pl-9 w-full bg-background" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="w-full sm:w-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-full sm:w-[180px] bg-background">
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Events</SelectItem>
              <SelectItem value="INFO">INFO</SelectItem>
              <SelectItem value="SUCCESS">SUCCESS</SelectItem>
              <SelectItem value="ERROR">ERROR</SelectItem>
              <SelectItem value="RULE_FAIL">RULE_FAIL</SelectItem>
              <SelectItem value="UI_EVENT">UI_EVENT</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            className="w-full sm:w-auto bg-background"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          >
            <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
            {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden">
        <ScrollArea className="h-[600px] w-full">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[200px]">Time</TableHead>
                <TableHead className="w-[120px]">Type</TableHead>
                <TableHead>Process Name</TableHead>
                <TableHead className="w-[80px] text-center">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-64 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Search className="h-8 w-8 mb-4 opacity-50" />
                      <p>No logs found. Waiting for events...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow 
                    key={log.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleRowClick(log)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-mono text-[10px] uppercase ${getCustomBadgeClasses(log.type)}`}>
                        {log.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {log.processName}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                        <Info className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Detail View Drawer (Sheet) */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-xl md:max-w-2xl overflow-y-auto bg-background/95 backdrop-blur border-l-border p-0">
          {selectedLog && (
            <div className="flex flex-col h-full">
              <SheetHeader className="p-6 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <Badge className={`font-mono text-xs ${getCustomBadgeClasses(selectedLog.type)}`}>
                    {selectedLog.type}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDate(selectedLog.timestamp)}
                  </span>
                </div>
                <SheetTitle className="text-xl font-semibold break-all">
                  {selectedLog.processName}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Activity className="w-3 h-3" />
                    ID: <span className="font-mono">{selectedLog.id}</span>
                  </span>
                </SheetDescription>
              </SheetHeader>
              
              <div className="p-6 flex-grow">
                <h3 className="text-sm font-medium mb-3 text-foreground">Payload</h3>
                <div className="rounded-lg overflow-hidden border border-border">
                  {/* Syntax Highland for JSON */}
                  <SyntaxHighlighter
                    language="json"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: '1.5rem',
                      background: 'hsl(var(--card))',
                      fontSize: '0.8125rem',
                      lineHeight: '1.5',
                    }}
                    wrapLongLines={true}
                  >
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </SyntaxHighlighter>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}

