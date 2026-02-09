
import { ButtonHTMLAttributes, FC, ReactNode } from 'react';

interface NeoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'yellow' | 'cyan' | 'white' | 'pink' | 'orange';
}

export const NeoButton: FC<NeoButtonProps> = ({ 
  children, 
  variant = 'yellow', 
  className = '', 
  ...props 
}) => {
  const variants = {
    yellow: 'bg-yellow-300 hover:bg-yellow-400',
    cyan: 'bg-cyan-300 hover:bg-cyan-400',
    white: 'bg-white hover:bg-gray-100',
    pink: 'bg-pink-400 hover:bg-pink-500',
    orange: 'bg-orange-400 hover:bg-orange-500',
  };

  return (
    <button 
      className={`
        border-4 border-black font-black uppercase py-3 px-6 
        shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
        hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]
        hover:-translate-x-[2px] hover:-translate-y-[2px]
        active:translate-x-[1px] active:translate-y-[1px]
        active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
        transition-all disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
};
