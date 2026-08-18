import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "accent";
  size?: "default" | "sm" | "icon";
};

const variants = {
  default: "bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)] hover:bg-teal-800",
  outline: "border border-slate-200 bg-white text-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
  accent: "bg-blue-700 text-white shadow-[0_6px_14px_rgba(29,78,216,0.16)] hover:bg-blue-800"
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
