import React, { useState } from 'react';
import { Plus, Trash2, Save, FileCode2, Code } from 'lucide-react';
import { ProcessRule, RuleValidation } from '../types';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ProcessRulesView() {
  const [rules, setRules] = useState<ProcessRule[]>([
    {
      id: 'rule-1',
      processName: 'create_waybill',
      requiredSteps: ['validate_order', 'check_inventory'],
      validations: [
        {
          id: 'v-1',
          paramA: 'order.status',
          operator: 'MUST_EQUAL',
          paramB: '"APPROVED"',
        }
      ]
    }
  ]);

  // Form State
  const [processName, setProcessName] = useState('');
  const [steps, setSteps] = useState([{ id: 's-init', value: '' }]);
  const [validations, setValidations] = useState<RuleValidation[]>([]);
  const [savedJson, setSavedJson] = useState<string | null>(null);

  const handleAddStep = () => {
    setSteps([...steps, { id: `s-${Date.now()}`, value: '' }]);
  };

  const handleUpdateStep = (id: string, value: string) => {
    setSteps(steps.map(s => s.id === id ? { ...s, value } : s));
  };

  const handleRemoveStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const handleAddValidation = () => {
    setValidations([
      ...validations, 
      { id: `v-${Date.now()}`, paramA: '', operator: 'MUST_EQUAL', paramB: '' }
    ]);
  };

  const handleUpdateValidation = (id: string, field: keyof RuleValidation, value: string) => {
    setValidations(validations.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleRemoveValidation = (id: string) => {
    setValidations(validations.filter(v => v.id !== id));
  };

  const handleSave = () => {
    if (!processName) return;

    const newRule: ProcessRule = {
      id: `rule-${Date.now()}`,
      processName,
      requiredSteps: steps.map(s => s.value).filter(Boolean),
      validations: validations.filter(v => v.paramA && v.paramB),
    };

    setRules([newRule, ...rules]);
    setSavedJson(JSON.stringify(newRule, null, 2));

    // Reset form
    setProcessName('');
    setSteps([{ id: `s-${Date.now()}`, value: '' }]);
    setValidations([]);
  };

  return (
    <div className="space-y-8 font-sans">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Process Rules</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure dynamic validations and required steps for API actions.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Form Container */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create New Rule</CardTitle>
              <CardDescription>Define a new process flow and parameters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Process Name</label>
                <Input 
                  placeholder="e.g. create_waybill" 
                  value={processName}
                  onChange={e => setProcessName(e.target.value)}
                />
              </div>

              {/* Steps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Required Steps</label>
                  <Button variant="outline" size="sm" onClick={handleAddStep}>
                    <Plus className="h-4 w-4 mr-1" /> Add Step
                  </Button>
                </div>
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <div className="flex bg-muted text-muted-foreground text-xs w-6 h-6 rounded items-center justify-center font-mono">
                      {index + 1}
                    </div>
                    <Input 
                      placeholder="step_name" 
                      value={step.value}
                      onChange={e => handleUpdateStep(step.id, e.target.value)}
                    />
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemoveStep(step.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Validations */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Parameter validation</label>
                  <Button variant="outline" size="sm" onClick={handleAddValidation}>
                    <Plus className="h-4 w-4 mr-1" /> Add Rule
                  </Button>
                </div>
                {validations.map(val => (
                  <div key={val.id} className="flex items-start gap-2 bg-muted/30 p-2 rounded-lg border border-border">
                    <Input 
                      placeholder="paramA" 
                      value={val.paramA}
                      onChange={e => handleUpdateValidation(val.id, 'paramA', e.target.value)}
                      className="w-1/3"
                    />
                    <Select value={val.operator} onValueChange={(val: any) => handleUpdateValidation(val.id, 'operator', val)}>
                      <SelectTrigger className="w-1/3">
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MUST_EQUAL">MUST_EQUAL</SelectItem>
                        <SelectItem value="MUST_NOT_EQUAL">MUST_NOT_EQUAL</SelectItem>
                        <SelectItem value="GREATER_THAN">GREATER_THAN</SelectItem>
                        <SelectItem value="LESS_THAN">LESS_THAN</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input 
                      placeholder="paramB or value" 
                      value={val.paramB}
                      onChange={e => handleUpdateValidation(val.id, 'paramB', e.target.value)}
                      className="w-1/3"
                    />
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0" onClick={() => handleRemoveValidation(val.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {validations.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No validation rules added yet.</p>
                )}
              </div>

            </CardContent>
            <CardFooter className="bg-muted/20 border-t border-border py-4 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Rules are applied in real-time.</span>
              <Button onClick={handleSave} disabled={!processName}>
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
            </CardFooter>
          </Card>

          {/* JSON Output Viewer */}
          {savedJson && (
            <Card>
              <CardHeader className="py-4 border-b border-border bg-muted/20">
                <CardTitle className="text-sm flex items-center">
                  <Code className="h-4 w-4 mr-2" />
                  Generated JSON
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <pre className="p-4 bg-background text-foreground font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                  {savedJson}
                </pre>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Existing Rules List */}
        <div>
          <Card className="h-full flex flex-col max-h-[800px]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4" />
                Configured Rules
              </CardTitle>
              <CardDescription>All currently active process constraints.</CardDescription>
            </CardHeader>
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead>Process</TableHead>
                      <TableHead className="w-[120px]">Steps</TableHead>
                      <TableHead className="w-[140px]">Validations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-semibold text-sm font-mono">
                          {rule.processName}
                        </TableCell>
                        <TableCell>
                          <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded">
                            {rule.requiredSteps.length} steps
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded">
                            {rule.validations.length} rules
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rules.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                          No rules defined.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
