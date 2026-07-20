import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "accent";
  size?: "default" | "sm" | "icon";
};

const variants = {
  default: "bg-gradient-to-r from-teal-600 to-blue-600 text-white shadow-[0_12px_24px_rgba(13,148,136,0.18)] hover:from-teal-700 hover:to-blue-700",
  outline: "border border-slate-200 bg-white/95 text-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.04)] hover:border-teal-200 hover:bg-teal-50/70 hover:text-teal-900",
  ghost: "text-slate-700 hover:bg-teal-50 hover:text-teal-900",
  accent: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.18)] hover:from-blue-700 hover:to-indigo-700"
};

const sizes = {
  default: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-xs",
  icon: "h-10 w-10"
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
