import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Mail,
  CalendarClock,
  Briefcase,
  LogOut,
  User,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from './ui/sidebar';
import { Button } from './ui/button';
import type { MailboxStatus } from '../utils/api';

interface AppSidebarProps {
  currentView: string;
  userEmail?: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  mailboxStatus: MailboxStatus | null;
  isMailboxLoading: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnectMailbox: (provider: 'google' | 'microsoft') => void;
  onDisconnectMailbox: () => void;
}

const navItems = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'builder', label: 'Form Builder', icon: ClipboardList },
  { view: 'results', label: 'Form Results', icon: FileText },
  { view: 'inbox', label: 'Email Inbox', icon: Mail },
  { view: 'calls', label: 'Calls', icon: CalendarClock },
  { view: 'portfolio', label: 'My Portfolio', icon: Briefcase },
];

export function AppSidebar({
  currentView,
  userEmail,
  onNavigate,
  onLogout,
  mailboxStatus,
  isMailboxLoading,
  isConnecting,
  isDisconnecting,
  onConnectMailbox,
  onDisconnectMailbox,
}: AppSidebarProps) {
  const isConnected = mailboxStatus?.connected ?? false;
  const connectedEmail = mailboxStatus?.email ?? '';

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src="/logo-yellow.png" alt="ScreenVC" className="h-10" />
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton
                    isActive={currentView === item.view}
                    onClick={() => onNavigate(item.view)}
                    tooltip={item.label}
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarSeparator />

        {/* Email connection status */}
        <div className="px-2 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium truncate">
              {isMailboxLoading ? 'Loading...' : isConnected ? connectedEmail : 'Email'}
            </span>
          </div>
          {!isMailboxLoading && (
            <>
              <p className={`text-xs mb-2 ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
                {isConnected ? 'Email connected' : 'Email not connected'}
              </p>
              {isConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={onDisconnectMailbox}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => onConnectMailbox('google')}
                  disabled={isConnecting}
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              )}
            </>
          )}
        </div>

        <SidebarSeparator />

        <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
          <User className="size-4 shrink-0" />
          <span className="truncate">{userEmail}</span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout}>
              <LogOut className="size-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
