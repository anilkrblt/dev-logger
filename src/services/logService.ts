import { LogEntry } from '../types';
import { generateMockLogs } from '../lib/mock-data';

export const logService = {
  async fetchLogs(): Promise<LogEntry[]> {
    try {
      // Simulate network request to a non-existent API
      const response = await fetch('/api/logs');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data as LogEntry[];
    } catch (error) {
      console.warn('API fetch failed, falling back to mock data:', error);
      // Fallback to mock data and simulate a small delay
      return new Promise<LogEntry[]>((resolve) => {
        setTimeout(() => {
          resolve(generateMockLogs(100));
        }, 800);
      });
    }
  }
};
