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

interface AppSidebarProps {
  currentView: string;
  userEmail?: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

const navItems = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'builder', label: 'Form Builder', icon: ClipboardList },
  { view: 'results', label: 'Form Results', icon: FileText },
  { view: 'inbox', label: 'Email Inbox', icon: Mail },
  { view: 'calls', label: 'Calls', icon: CalendarClock },
  { view: 'portfolio', label: 'My Portfolio', icon: Briefcase },
];

export function AppSidebar({ currentView, userEmail, onNavigate, onLogout }: AppSidebarProps) {
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
