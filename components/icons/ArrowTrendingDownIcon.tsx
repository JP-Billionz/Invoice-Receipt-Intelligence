import React from 'react';

export const ArrowTrendingDownIcon = ({ className = "w-5 h-5" }: { className?: string }): React.ReactNode => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.306-4.307a11.95 11.95 0 015.814 5.519l2.74 1.22m0 0l-3.75.625m3.75-.625V18.375" />
    </svg>
);
