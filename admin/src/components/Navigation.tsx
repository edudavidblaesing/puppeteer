'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Building2,
  Globe,
  Briefcase,
  Settings,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { fetchStats } from '@/lib/api';

const mainMenuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: Calendar, badge: 'events' },
  { href: '/venues', label: 'Venues', icon: Building2 },
  { href: '/artists', label: 'Artists', icon: Users },
  { href: '/organizers', label: 'Organizers', icon: Briefcase },
  { href: '/cities', label: 'Cities', icon: Globe },
];

const otherItems = [
  { href: '/sources', label: 'Sources', icon: Globe }, // Re-using Globe or maybe Database/Server icon if available
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [eventCount, setEventCount] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await fetchStats();
        if (stats && stats.total_main_events) {
          setEventCount(stats.total_main_events.toString());
        }
      } catch (error) {
        console.error('Failed to load nav stats:', error);
      }
    };
    loadStats();
  }, []);

  // Don't show navigation on login page
  if (pathname === '/login') {
    return null;
  }

  return (
    <aside className={clsx(
      "bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 h-full",
      collapsed ? "w-20" : "w-64"
    )}>
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center text-white dark:text-gray-900 font-bold shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg text-gray-900 dark:text-white leading-tight">EventHub</span>
              <span className="text-[10px] text-gray-400 font-medium">Global Events Manager</span>
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="ml-auto p-1 text-gray-400 hover:text-gray-600">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Menu */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
        <div>
          {!collapsed && (
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 px-2">
              Main Menu
            </h3>
          )}
          <div className="space-y-1">
            {mainMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const badgeValue = item.badge === 'events' ? eventCount : item.badge;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all group',
                    isActive
                      ? 'bg-[#FF6A1F] text-white shadow-lg shadow-orange-500/20'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={clsx("w-5 h-5", isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600")} />
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {badgeValue && (
                        <span className={clsx(
                          "text-xs w-6 h-6 flex items-center justify-center rounded-full",
                          isActive ? "bg-white/20 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        )}>
                          {badgeValue}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          {!collapsed && (
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 px-2">
              Other
            </h3>
          )}
          <div className="space-y-1">
            {otherItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-all group',
                    isActive
                      ? 'bg-[#FF6A1F] text-white shadow-lg shadow-orange-500/20'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={clsx("w-5 h-5", isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600")} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
        {user ? (
          <div className={clsx(
            "flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700",
            collapsed ? "justify-center" : ""
          )}>
            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-none mb-1">
                  {user.username}
                </p>
                <p className="text-[10px] text-gray-500 truncate font-medium">
                  Administrator
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
