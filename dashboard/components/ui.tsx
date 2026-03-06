/**
 * Lightweight UI primitives — no external shadcn setup needed.
 */
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "green" | "yellow" | "red" | "blue" | "purple" | "gray";
  className?: string;
}) {
  const variants = {
    default: "bg-zinc-700 text-zinc-300",
    green:   "bg-emerald-900/60 text-emerald-400 border border-emerald-800",
    yellow:  "bg-amber-900/60 text-amber-400 border border-amber-800",
    red:     "bg-red-900/60 text-red-400 border border-red-800",
    blue:    "bg-blue-900/60 text-blue-400 border border-blue-800",
    purple:  "bg-indigo-900/60 text-indigo-400 border border-indigo-800",
    gray:    "bg-zinc-800 text-zinc-500",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-zinc-900 border border-zinc-800 rounded-2xl p-4", className)}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}) {
  const variants = {
    default: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700",
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white",
    ghost:   "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200",
    danger:  "bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-800",
    success: "bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800",
  };
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
    lg: "px-5 py-3 text-base",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <div className="border-t border-zinc-800 my-3" />;
}

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none",
        className
      )}
    />
  );
}
