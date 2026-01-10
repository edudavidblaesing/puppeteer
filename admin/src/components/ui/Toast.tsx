import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContainerProps {
    toasts: Toast[];
    removeToast: (id: string) => void;
}

const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />
};

const styles = {
    success: 'bg-white dark:bg-gray-800 border-green-500',
    error: 'bg-white dark:bg-gray-800 border-red-500',
    info: 'bg-white dark:bg-gray-800 border-blue-500',
    warning: 'bg-white dark:bg-gray-800 border-yellow-500'
};

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-l-4 min-w-[300px] animate-in slide-in-from-right fade-in duration-300 ${styles[toast.type]}`}
                    role="alert"
                >
                    {icons[toast.type]}
                    <p className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{toast.message}</p>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>,
        document.body
    );
}
