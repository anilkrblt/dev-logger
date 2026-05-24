export interface LogEntry {
  id: string;
  timestamp: string; // ISO string
  type: 'INFO' | 'SUCCESS' | 'ERROR' | 'RULE_FAIL' | 'UI_EVENT';
  processName: string;
  payload: any; // JSON payload
}

export interface RuleValidation {
  id: string;
  paramA: string;
  operator: 'MUST_EQUAL' | 'MUST_NOT_EQUAL' | 'GREATER_THAN' | 'LESS_THAN';
  paramB: string;
}

export interface ProcessRule {
  id: string;
  processName: string;
  requiredSteps: string[];
  validations: RuleValidation[];
}
