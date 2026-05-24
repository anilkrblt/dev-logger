import { useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { axiosClient } from '../lib/httpClient';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export default function LogTestDashboard() {
  const [status, setStatus] = useState<RequestState>('idle');
  const [result, setResult] = useState('No request sent yet.');

  const runRequest = async (request: () => Promise<unknown>) => {
    setStatus('loading');

    try {
      const data = await request();
      setStatus('success');
      setResult(formatResult(data));
    } catch (error) {
      setStatus('error');
      setResult(error instanceof Error ? error.message : String(error));
    }
  };

  const successFetch = () => runRequest(async () => {
    const response = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    return response.json();
  });

  const sensitiveFetch = () => runRequest(async () => {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token-123',
      },
      body: JSON.stringify({
        username: 'demo-user',
        password: 'my-super-secret-password',
        token: 'client-side-token',
      }),
    });

    const body = await response.json().catch(() => null);
    return body ?? { status: response.status };
  });

  const failedFetch = () => runRequest(async () => {
    await fetch('https://invalid-domain-xyz.com/api');
    return { status: 'unexpected success' };
  });

  const successAxios = () => runRequest(async () => {
    const response = await axiosClient.get('https://jsonplaceholder.typicode.com/todos/2');
    return response.data;
  });

  const sensitiveAxios = () => runRequest(async () => {
    const response = await axiosClient.post(
      'https://jsonplaceholder.typicode.com/posts',
      {
        username: 'axios-user',
        password: 'axios-super-secret-password',
        token: 'axios-client-token',
      },
      {
        headers: {
          Authorization: 'Bearer axios-secret-token-456',
        },
      },
    );

    return response.data;
  });

  return (
    <section className="space-y-6 font-sans">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Runtime Log Test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trigger fetch events and watch the local CLI stream protocol logs.
        </p>
      </header>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-3">
          <Button onClick={successFetch} disabled={status === 'loading'}>
            <CheckCircle2 className="h-4 w-4" />
            Success Fetch
          </Button>
          <Button variant="secondary" onClick={sensitiveFetch} disabled={status === 'loading'}>
            <KeyRound className="h-4 w-4" />
            Sensitive Data Fetch
          </Button>
          <Button variant="destructive" onClick={failedFetch} disabled={status === 'loading'}>
            <AlertTriangle className="h-4 w-4" />
            Failed Fetch
          </Button>
          <Button variant="outline" onClick={successAxios} disabled={status === 'loading'}>
            <Send className="h-4 w-4" />
            Axios Success
          </Button>
          <Button variant="outline" onClick={sensitiveAxios} disabled={status === 'loading'}>
            <KeyRound className="h-4 w-4" />
            Axios Sensitive
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Latest Result</h2>
          <span className="text-xs font-mono uppercase text-muted-foreground">{status}</span>
        </div>
        <pre className="min-h-48 overflow-auto whitespace-pre-wrap bg-muted/30 p-4 text-xs leading-5">
          {result}
        </pre>
      </div>
    </section>
  );
}

function formatResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
