import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "accent";
  size?: "default" | "sm" | "icon";
};

const variants = {
  default: "bg-[#101827] text-white shadow-none hover:bg-[#1b2639]",
  outline: "border border-slate-200 bg-white text-slate-800 shadow-none hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
  accent: "bg-[#b9ed5c] text-[#101827] shadow-none hover:bg-[#a9df49]"
};

const sizes = {
  default: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-sm",
  icon: "h-10 w-10"
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
