
import React from 'react';

interface NeoCardProps {
  children: React.ReactNode;
  className?: string;
  bgColor?: string;
  title?: string;
}

export const NeoCard: React.FC<NeoCardProps> = ({ children, className = '', bgColor = 'bg-white', title }) => {
  return (
    <div className={`border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 ${bgColor} ${className}`}>
      {title && <h2 className="text-2xl font-black uppercase mb-4 border-b-4 border-black pb-2">{title}</h2>}
      {children}
    </div>
  );
};
