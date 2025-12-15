import React from 'react';
import { Database } from 'lucide-react';

interface SourceIconProps {
    sourceCode: string;
    className?: string; // e.g. "w-4 h-4"
    showTooltip?: boolean;
}

const LOGO_MAP: Record<string, string> = {
    tm: '/logos/tm.png',
    eb: '/logos/eb.png',
    di: '/logos/di.png',
    mb: '/logos/mb.png',
    fb: '/logos/fb.png',
    ra: '/logos/ra.jpg',
    // legacy fallbacks
    ticketmaster: '/logos/tm.png',
    eventbrite: '/logos/eb.png',
    dice: '/logos/di.png',
    musicbrainz: '/logos/mb.png',
    facebook: '/logos/fb.png',
};

const SOURCE_NAMES: Record<string, string> = {
    tm: 'Ticketmaster',
    eb: 'Eventbrite',
    di: 'Dice',
    mb: 'MusicBrainz',
    fb: 'Facebook',
    ra: 'Resident Advisor',
    og: 'Original/Manual'
};

export function SourceIcon({ sourceCode, className = "w-4 h-4", showTooltip = true }: SourceIconProps) {
    const code = sourceCode?.toLowerCase();
    const title = SOURCE_NAMES[code] || code?.toUpperCase();

    if (code === 'og' || code === 'original') {
        return (
            <div className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-sm ${className}`} title={showTooltip ? title : undefined}>
                <Database className="w-[80%] h-[80%] text-gray-500" />
            </div>
        );
    }

    const logoPath = LOGO_MAP[code];

    if (logoPath) {
        return (
            <img
                src={logoPath}
                alt={code}
                className={`${className} object-contain rounded-sm`}
                title={showTooltip ? title : undefined}
            />
        );
    }

    // Fallback for unknown sources
    return (
        <span
            className={`flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded px-1 min-w-[1.5em] ${className} text-[60%]`}
            title={showTooltip ? title : undefined}
        >
            {code?.slice(0, 2).toUpperCase()}
        </span>
    );
}
