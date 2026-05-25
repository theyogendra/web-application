"use client";

import React from "react";

// Shared UI primitives — Apple/Microsoft-inspired:
// pure surfaces, minimal borders, soft shadow, generous radii.

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-semibold text-[var(--text-primary)] leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-[15px] text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={[
        "surface rounded-2xl border border-[var(--separator-soft)] shadow-card",
        hover ? "lift hover:shadow-soft" : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50";
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-[13px]",
    md: "px-4 py-2 text-[14px]",
  };
  const variants: Record<string, string> = {
    primary:
      "bg-[#0071E3] text-white shadow-sm hover:bg-[#0077ED] active:bg-[#005BBF]",
    secondary:
      "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--separator)] hover:bg-[var(--bg-subtle)]",
    danger:
      "bg-[#FF3B30] text-white shadow-sm hover:bg-[#FF453A] active:bg-[#D70015]",
    ghost:
      "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-14 text-[14px] text-[var(--text-secondary)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--separator)] border-t-[#0071E3]" />
      {label}
    </div>
  );
}

export function EmptyState({
  message = "Nothing to show yet.",
  icon,
}: {
  message?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center animate-fade-in">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--text-tertiary)] border border-[var(--separator-soft)]">
        {icon ?? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 8v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5Z" />
            <path d="M9 12h6" />
          </svg>
        )}
      </div>
      <p className="text-[14px] text-[var(--text-secondary)]">{message}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-danger-500/20 bg-danger-50 p-4 text-[14px] text-danger-600 dark:bg-danger-500/10 dark:border-danger-500/30 dark:text-danger-500">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 opacity-90">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-3 rounded-md border border-danger-500/30 bg-white px-3 py-1.5 text-[13px] font-medium text-danger-600 transition-colors hover:bg-danger-50 dark:bg-transparent dark:hover:bg-danger-500/10"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)] tracking-wide">
        {label}
        {required ? <span className="text-danger-500"> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[12px] text-[var(--text-tertiary)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--separator)] bg-[var(--bg-surface)] px-3 py-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all outline-none focus:border-[#0071E3] focus:shadow-[0_0_0_3px_rgba(10,132,255,0.15)] disabled:cursor-not-allowed disabled:opacity-60";

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${inputClass} ${className}`} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${inputClass} min-h-[80px] ${className}`} />;
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`${inputClass} pr-8 ${className}`}>
      {children}
    </select>
  );
}
