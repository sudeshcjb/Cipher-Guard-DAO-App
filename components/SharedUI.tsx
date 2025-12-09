import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = "", title }) => (
  <div className={`bg-cyber-800 border border-cyber-600 rounded-lg shadow-xl overflow-hidden ${className}`}>
    {title && (
      <div className="bg-cyber-700 px-4 py-3 border-b border-cyber-600 flex items-center justify-between">
        <h3 className="text-cyber-100 font-semibold tracking-wide uppercase text-sm">{title}</h3>
        <div className="h-2 w-2 rounded-full bg-cyber-neon shadow-[0_0_8px_rgba(0,255,157,0.6)]"></div>
      </div>
    )}
    <div className="p-6">
      {children}
    </div>
  </div>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }> = ({ 
  children, 
  variant = 'primary', 
  className = "", 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2 rounded font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-cyber-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider";
  
  const variants = {
    primary: "bg-cyber-neon text-cyber-900 hover:bg-emerald-400 focus:ring-cyber-neon shadow-[0_0_15px_rgba(0,255,157,0.2)]",
    secondary: "bg-cyber-600 text-cyber-100 hover:bg-cyber-500 focus:ring-cyber-400 border border-cyber-500",
    danger: "bg-cyber-alert text-white hover:bg-red-600 focus:ring-red-500",
    ghost: "bg-transparent text-cyber-300 hover:text-cyber-100 hover:bg-cyber-800"
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className = "", ...props }) => (
  <div className="mb-4">
    {label && <label className="block text-xs font-medium text-cyber-300 uppercase tracking-wider mb-2">{label}</label>}
    <input 
      className={`w-full bg-cyber-900 border border-cyber-600 text-cyber-100 rounded px-3 py-2 focus:outline-none focus:border-cyber-neon focus:ring-1 focus:ring-cyber-neon placeholder-cyber-500 transition-colors ${className}`}
      {...props}
    />
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; color?: 'green' | 'blue' | 'red' }> = ({ children, color = 'blue' }) => {
  const colors = {
    green: 'bg-emerald-900 text-emerald-300 border-emerald-700',
    blue: 'bg-blue-900 text-blue-300 border-blue-700',
    red: 'bg-red-900 text-red-300 border-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs border ${colors[color]} font-mono`}>
      {children}
    </span>
  );
};
