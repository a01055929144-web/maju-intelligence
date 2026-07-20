import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "accent";
  size?: "default" | "sm" | "icon";
};

const variants = {
  default: "bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.12)] hover:bg-slate-800",
  outline: "border border-slate-200 bg-white/90 text-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  accent: "bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.18)] hover:bg-blue-700"
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
