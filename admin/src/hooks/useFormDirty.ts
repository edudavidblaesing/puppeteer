import { useRef, useEffect, useState } from 'react';

export function useFormDirty(formData: any, initialData: any) {
    const [isDirty, setIsDirty] = useState(false);
    const initialRef = useRef(initialData);

    // Update initial ref if initialData genuinely changes (e.g. fresh fetch)
    // But be careful not to reset it on minor re-renders.
    // We assume initialData is stable or we want to reset dirty state when it changes.
    useEffect(() => {
        initialRef.current = initialData;
    }, [initialData]);

    useEffect(() => {
        if (!formData || !initialRef.current) {
            setIsDirty(false);
            return;
        }

        // Deep comparison helper could be more robust, but JSON stringify works for simple DTOs
        // We need to handle potential key order differences or specific field exclusions?
        // For now, consistent JSON.stringify + simple normalization in the form component is best.
        // However, let's try to be smart about "empty string" vs "null" if possible, 
        // or leave that to the form component's normalization logic.

        // Simplest approach: compare stringified versions.
        const currentStr = JSON.stringify(formData);
        const initialStr = JSON.stringify(initialRef.current);

        setIsDirty(currentStr !== initialStr);
    }, [formData, initialData]); // Depend on initialData to re-eval if it changes

    return isDirty;
}
