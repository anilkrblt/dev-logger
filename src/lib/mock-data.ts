import { LogEntry } from '../types';

const processNames = ['create_waybill', 'validate_order', 'check_inventory', 'update_stock', 'process_payment'];

export function generateMockLogs(count: number = 50): LogEntry[] {
  const logs: LogEntry[] = [];
  let currentTime = new Date();
  
  for (let i = 0; i < count; i++) {
    currentTime = new Date(currentTime.getTime() - Math.floor(Math.random() * 120000)); 
    const processName = processNames[Math.floor(Math.random() * processNames.length)];
    
    let type: LogEntry['type'] = 'INFO';
    const typeRoll = Math.random();
    if (typeRoll < 0.5) type = 'SUCCESS';
    else if (typeRoll < 0.6) type = 'ERROR';
    else if (typeRoll < 0.7) type = 'RULE_FAIL';
    else type = 'INFO';
    
    logs.push({
      id: `log-${currentTime.getTime()}-${i}`,
      timestamp: currentTime.toISOString(),
      type,
      processName,
      payload: generateMockPayload(type, processName)
    });
  }
  
  return logs;
}

function generateMockPayload(type: LogEntry['type'], processName: string) {
  switch (type) {
    case 'SUCCESS':
      return { status: 'ok', recordsProcessed: Math.floor(Math.random() * 100) };
    case 'ERROR':
      return { error: 'Internal server error', code: 500 };
    case 'RULE_FAIL':
      return { rule: 'target_depot != source_depot', message: 'Validation failed' };
    case 'INFO':
    default:
      return { event: 'step_started', worker: 'worker-1' };
  }
}

