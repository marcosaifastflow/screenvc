import type { ReactNode } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from './ui/separator';
import type { MailboxStatus } from '../utils/api';

interface AuthenticatedLayoutProps {
  currentView: string;
  userEmail?: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  children: ReactNode;
  mailboxStatus: MailboxStatus | null;
  isMailboxLoading: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnectMailbox: (provider: 'google' | 'microsoft') => void;
  onDisconnectMailbox: () => void;
}

export function AuthenticatedLayout({
  currentView,
  userEmail,
  onNavigate,
  onLogout,
  children,
  mailboxStatus,
  isMailboxLoading,
  isConnecting,
  isDisconnecting,
  onConnectMailbox,
  onDisconnectMailbox,
}: AuthenticatedLayoutProps) {
  return (
    <SidebarProvider defaultOpen={true} className="!min-h-0 h-full">
      <AppSidebar
        currentView={currentView}
        userEmail={userEmail}
        onNavigate={onNavigate}
        onLogout={onLogout}
        mailboxStatus={mailboxStatus}
        isMailboxLoading={isMailboxLoading}
        isConnecting={isConnecting}
        isDisconnecting={isDisconnecting}
        onConnectMailbox={onConnectMailbox}
        onDisconnectMailbox={onDisconnectMailbox}
      />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <span className="text-sm text-muted-foreground capitalize">
            {currentView === 'builder' ? 'Form Builder' : currentView === 'results' ? 'Form Results' : currentView === 'inbox' ? 'Email Inbox' : currentView === 'portfolio' ? 'My Portfolio' : currentView}
          </span>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
