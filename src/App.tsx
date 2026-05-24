import React, { useState } from 'react';
import { Activity, LayoutDashboard, FileCode2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

import DashboardView from './components/DashboardView';
import LogTestDashboard from './components/LogTestDashboard';
import ProcessRulesView from './components/ProcessRulesView';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getActiveTab(location.pathname);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <div className="flex h-screen w-full bg-background font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col z-20 shadow-sm relative">
        <div className="p-6 border-b border-border bg-muted/10 h-[72px] flex items-center">
          <div className="flex items-center gap-2 text-primary">
            <LayoutDashboard className="h-6 w-6" />
            <h2 className="font-bold text-lg tracking-tight">Observer UI</h2>
          </div>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <Button 
            variant={activeTab === 'dashboard' ? 'secondary' : 'ghost'} 
            onClick={() => handleNavigate('/')} 
            className="justify-start font-medium"
          >
            <LayoutDashboard className="mr-3 h-4 w-4" />
            Live Logs
          </Button>
          
          <Button 
            variant={activeTab === 'rules' ? 'secondary' : 'ghost'} 
            onClick={() => handleNavigate('/rules')} 
            className="justify-start font-medium"
          >
            <FileCode2 className="mr-3 h-4 w-4" />
            Process Rules
          </Button>

          <Button
            variant={activeTab === 'test' ? 'secondary' : 'ghost'}
            onClick={() => handleNavigate('/runtime-test')}
            className="justify-start font-medium"
          >
            <Activity className="mr-3 h-4 w-4" />
            Runtime Test
          </Button>
        </nav>
        
        <div className="p-4 border-t border-border mt-auto">
          <p className="text-xs text-muted-foreground text-center">Version 1.0.0</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto relative bg-background">
        <div className="min-h-full p-4 md:p-8">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'rules' && <ProcessRulesView />}
          {activeTab === 'test' && <LogTestDashboard />}
        </div>
      </main>

    </div>
  );
}

function getActiveTab(pathname: string): 'dashboard' | 'rules' | 'test' {
  if (pathname === '/rules') {
    return 'rules';
  }

  if (pathname === '/runtime-test') {
    return 'test';
  }

  return 'dashboard';
}
