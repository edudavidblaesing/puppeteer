'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Users,
  Building2,
  Globe,
  CloudDownload,
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/artists', label: 'Artists', icon: Users },
  { href: '/venues', label: 'Venues', icon: Building2 },
  { href: '/cities', label: 'Cities', icon: Globe },
  { href: '/scrape', label: 'Scrape', icon: CloudDownload },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b px-4 py-2">
      <div className="flex items-center gap-1">
        <Link href="/" className="font-bold text-lg text-indigo-600 mr-6">
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
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
