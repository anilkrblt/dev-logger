import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import {
  ReactLogProvider,
  createAxiosAdapter,
  createFetchAdapter,
  createRouterAdapter,
} from '@react-log-agent/runtime';
import App from './App.tsx';
import { axiosClient } from './lib/httpClient';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const logAdapters = [
  createRouterAdapter(),
  createFetchAdapter(),
  createAxiosAdapter(axiosClient),
];
const redactRules = ['authorization', 'cookie', 'password', 'token'];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReactLogProvider
      enabled={true}
      adapters={logAdapters}
      redact={redactRules}
      appName="Dev Logger Dashboard"
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ReactLogProvider>
  </StrictMode>,
);
