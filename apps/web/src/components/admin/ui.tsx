"use client";

/**
 * Admin UI primitives — dense, token-consistent building blocks.
 */
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const CHIP_TONES: Record<string, string> = {
  // Order / split statuses
  PENDING_PAYMENT: "bg-white/10 text-white/70",
  PAYMENT_CONFIRMED: "bg-jade-tint text-jade-deep",
  PARTNER_DISPATCHED: "bg-jade-tint text-jade-deep",
  ACCEPTED_BY_PARTNER: "bg-jade-tint text-jade-deep",
  SENT_TO_PARTNER: "bg-surface-muted text-charcoal-muted",
  SHIPPED: "bg-surface-subtle text-charcoal",
  DELIVERED: "bg-jade-deep text-white",
  PENDING: "bg-white/10 text-white/70",
  CANCELLED: "bg-error-container text-error",
  REJECTED_BY_PARTNER: "bg-error-container text-error",
  REFUNDED: "bg-error-container text-error",
  FAILED: "bg-error-container text-error",
  // Webhook outcomes
  OK: "bg-jade-tint text-jade-deep",
  PROCESSED: "bg-jade-tint text-jade-deep",
  DUPLICATE: "bg-surface-muted text-charcoal-muted",
  IGNORED: "bg-surface-muted text-charcoal-muted",
  INVALID_SIGNATURE: "bg-error-container text-error",
  ERROR: "bg-error-container text-error",
  UNKNOWN: "bg-white/10 text-white/70",
};

export function StatusChip({ label, tone }: { label: string; tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider",
        tone ?? CHIP_TONES[label] ?? "bg-white/10 text-white/70",
      )}
    >
      {label.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: string;
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "alert" | "good";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "alert"
          ? "border-error/20 bg-error-container/40"
          : tone === "good"
            ? "border-jade/20 bg-jade-tint/50"
            : "border-neutral-200/60 bg-white",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "material-symbols-outlined text-lg",
            tone === "alert" ? "text-error" : tone === "good" ? "text-jade-deep" : "text-charcoal-light",
          )}
        >
          {icon}
        </span>
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-charcoal-light">
          {label}
        </span>
      </div>
      <div className="font-display text-2xl font-bold tracking-tight text-charcoal">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-charcoal-muted">{sub}</div> : null}
    </div>
  );
}

/** Admin panel actions — dark pill by default, coral for primary. */
export function AdminButton({
  children,
  onClick,
  variant = "dark",
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "dark" | "coral" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 font-display text-[11px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
        variant === "dark" && "bg-charcoal text-canvas hover:bg-charcoal-muted",
        variant === "coral" && "bg-brand text-white hover:bg-brand-dark",
        variant === "ghost" && "border border-neutral-200/80 bg-white text-charcoal-muted hover:border-charcoal/40 hover:text-charcoal",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-[0.16em] text-charcoal-light">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-charcoal-muted">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-neutral-200/80 bg-white px-3 py-2 text-sm text-charcoal outline-none transition-colors placeholder:text-charcoal-light focus:border-charcoal/40";

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-error/20 bg-error-container px-4 py-3">
      <span className="material-symbols-outlined text-lg text-error">error</span>
      <p className="text-xs font-medium text-error">{message}</p>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold uppercase tracking-wider text-charcoal-light">
      <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
      {label}…
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-middle", className)}>{children}</td>;
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal-light",
        className,
      )}
    >
      {children}
    </th>
  );
}
