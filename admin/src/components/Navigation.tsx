'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Users,
  Building2,
  Globe,
  CloudDownload,
  LogOut,
  User,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/artists', label: 'Artists', icon: Users },
  { href: '/venues', label: 'Venues', icon: Building2 },
  { href: '/cities', label: 'Cities', icon: Globe },
  { href: '/scrape', label: 'Scrape', icon: CloudDownload },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Don't show navigation on login page
  if (pathname === '/login') {
    return null;
  }

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
      <div className="flex items-center gap-1">
        <Link href="/events" className="font-bold text-lg text-indigo-600 dark:text-indigo-400 mr-6">
          Event Admin
        </Link>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (pathname === '/' && item.href === '/events');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* User info and logout */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <User className="w-4 h-4" />
              <span>{user.username}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
