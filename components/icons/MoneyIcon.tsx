
import React from 'react';

export const MoneyIcon = ({ className = "w-5 h-5 mr-2" }: { className?: string }): React.ReactNode => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M4.93 4.93l.707.707M18.364 18.364l.707.707M12 21a9 9 0 100-18 9 9 0 000 18z" />
  </svg>
);
