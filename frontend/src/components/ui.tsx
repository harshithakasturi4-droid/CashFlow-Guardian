import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50",
        "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-95",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-4 text-slate-950 outline-none ring-0 transition",
        "placeholder:text-slate-400 focus:border-[hsl(var(--primary))] focus:shadow-[0_0_0_3px_hsla(154,77%,28%,0.12)]",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-xl border border-[hsl(var(--border))] bg-white px-4 py-3 text-slate-950 outline-none transition",
        "placeholder:text-slate-400 focus:border-[hsl(var(--primary))] focus:shadow-[0_0_0_3px_hsla(154,77%,28%,0.12)]",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={cn("rounded-lg border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] sm:p-6", className)}>
      {children}
    </section>
  );
}

export function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}
