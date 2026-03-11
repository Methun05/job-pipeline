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
    default: "bg-zinc-100 text-zinc-600",
    green:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
    yellow:  "bg-amber-50 text-amber-700 border border-amber-200",
    red:     "bg-red-50 text-red-600 border border-red-200",
    blue:    "bg-blue-50 text-blue-700 border border-blue-200",
    purple:  "bg-violet-50 text-violet-700 border border-violet-200",
    gray:    "bg-zinc-100 text-zinc-500",
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
    <div className={cn("bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm", className)}>
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
    default: "bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 shadow-sm",
    primary: "bg-violet-600 hover:bg-violet-500 text-white shadow-sm",
    ghost:   "hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800",
    danger:  "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200",
    success: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200",
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
  return <div className="border-t border-zinc-200 my-3" />;
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
        "w-full bg-white border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none shadow-sm",
        className
      )}
    />
  );
}
