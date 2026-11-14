"use client";

/**
 * Admin command palette (⌘K / Ctrl+K).
 *
 * Local navigation is instant; entities are searched server-side with a
 * debounce: orders by number/email/name, products by name/SKU, customers
 * by name/email. Every result deep-links straight into its detail page.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminApi } from "./api-context";
import type { AdminOrderList, AdminProductRow } from "@/lib/admin-client";

type Item = {
  key: string;
  group: string;
  label: string;
  sub?: string;
  href: string;
  icon: string;
};

const PAGES: Item[] = [
  { key: "p-overview", group: "Pages", label: "Overview", href: "/admin", icon: "space_dashboard" },
  { key: "p-live", group: "Pages", label: "Live Ops", href: "/admin/live", icon: "bolt" },
  { key: "p-analytics", group: "Pages", label: "Analytics", href: "/admin/analytics", icon: "monitoring" },
  { key: "p-orders", group: "Pages", label: "Orders", href: "/admin/orders", icon: "receipt_long" },
  { key: "p-fulfillment", group: "Pages", label: "Fulfillment", href: "/admin/fulfillment", icon: "local_shipping" },
  { key: "p-inventory", group: "Pages", label: "Inventory", href: "/admin/inventory", icon: "inventory_2" },
  { key: "p-catalog", group: "Pages", label: "Catalog", href: "/admin/products", icon: "checkroom" },
  { key: "p-new-product", group: "Pages", label: "Create product", href: "/admin/products/new", icon: "add_box" },
  { key: "p-customers", group: "Pages", label: "Customers", href: "/admin/customers", icon: "diversity_3" },
  { key: "p-partners", group: "Pages", label: "Partners", href: "/admin/partners", icon: "hub" },
  { key: "p-zones", group: "Pages", label: "Countries & currency", href: "/admin/zones", icon: "public" },
  { key: "p-promos", group: "Pages", label: "Promos", href: "/admin/promos", icon: "sell" },
  { key: "p-studio", group: "Pages", label: "Social Studio", href: "/admin/social", icon: "campaign" },
  { key: "p-team", group: "Pages", label: "Team & audit", href: "/admin/team", icon: "group" },
  { key: "p-webhooks", group: "Pages", label: "Webhooks", href: "/admin/webhooks", icon: "webhook" },
];

type CustomerRow = { email: string; name: string; orders: number; country: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdminApi();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Item[]>([]);
  const [products, setProducts] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryRef = useRef("");

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGES.slice(0, 6);
    return PAGES.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setOrders([]);
      setProducts([]);
      setCustomers([]);
      setActive(0);
      // Focus after mount (palette is conditionally rendered).
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* Debounced entity search. */
  useEffect(() => {
    const q = query.trim();
    queryRef.current = q;
    if (q.length < 2) {
      setOrders([]);
      setProducts([]);
      setCustomers([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      const stale = (): boolean => queryRef.current !== q;
      void Promise.allSettled([
        api.get<AdminOrderList>(`/api/admin/orders?q=${encodeURIComponent(q)}`).then((r) => {
          if (stale()) return;
          setOrders(
            (r.orders ?? []).slice(0, 5).map((o) => ({
              key: `o-${o.id}`,
              group: "Orders",
              label: o.orderNumber,
              sub: `${o.email} · ${o.status}`,
              href: `/admin/orders/${o.id}`,
              icon: "receipt_long",
            })),
          );
        }),
        api.get<{ products: AdminProductRow[] }>(`/api/admin/products?q=${encodeURIComponent(q)}`).then((r) => {
          if (stale()) return;
          setProducts(
            (r.products ?? []).slice(0, 5).map((p) => ({
              key: `p-${p.id}`,
              group: "Products",
              label: p.name,
              sub: `${p.slug} · ${p.totalStock} in stock`,
              href: `/admin/products/${p.id}`,
              icon: "checkroom",
            })),
          );
        }),
        api.get<{ customers: CustomerRow[] }>("/api/admin/customers").then((r) => {
          if (stale()) return;
          const needle = q.toLowerCase();
          setCustomers(
            (r.customers ?? [])
              .filter((c) => c.email.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle))
              .slice(0, 5)
              .map((c) => ({
                key: `c-${c.email}`,
                group: "Customers",
                label: c.name,
                sub: `${c.email} · ${c.orders} order${c.orders === 1 ? "" : "s"} · ${c.country}`,
                href: `/admin/customers?q=${encodeURIComponent(c.email)}`,
                icon: "diversity_3",
              })),
          );
        }),
      ]).finally(() => {
        if (!stale()) setSearching(false);
      });
    }, 220);
    return () => clearTimeout(timer);
  }, [api, query]);

  const items = useMemo(
    () => [...pages, ...orders, ...products, ...customers],
    [pages, orders, products, customers],
  );

  const flatActive = Math.min(active, Math.max(items.length - 1, 0));

  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      onClose();
      router.push(item.href);
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        go(items[flatActive]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, flatActive, go, onClose]);

  if (!open) return null;

  let index = 0;
  const renderGroup = (label: string, list: Item[]) => {
    if (list.length === 0) return null;
    return (
      <div key={label}>
        <p className="sticky top-0 z-10 bg-canvas/95 px-4 py-1.5 font-display text-[9px] font-bold uppercase tracking-[0.18em] text-charcoal-light backdrop-blur">
          {label}
        </p>
        {list.map((item) => {
          const i = index++;
          const isActive = i === flatActive;
          return (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                isActive ? "bg-brand/10" : "hover:bg-surface-muted/70"
              }`}
            >
              <span
                className={`material-symbols-outlined text-base ${isActive ? "text-brand" : "text-charcoal-light"}`}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-charcoal">{item.label}</span>
                {item.sub ? <span className="block truncate text-[10px] text-charcoal-muted">{item.sub}</span> : null}
              </span>
              {isActive ? <span className="font-mono text-[9px] text-brand">↵</span> : null}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-charcoal/40 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-canvas shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-neutral-200/80 px-4">
          <span className="material-symbols-outlined text-lg text-charcoal-light">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search orders, products, customers or jump to a page…"
            className="h-12 flex-1 bg-transparent text-sm text-charcoal outline-none placeholder:text-charcoal-light"
          />
          {searching ? (
            <span className="material-symbols-outlined animate-spin text-sm text-charcoal-light">progress_activity</span>
          ) : (
            <kbd className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[9px] text-charcoal-light">
              ESC
            </kbd>
          )}
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1">
          {items.length === 0 && query.trim().length >= 2 && !searching ? (
            <p className="px-4 py-8 text-center text-xs text-charcoal-muted">
              Nothing matched “{query.trim()}”. Try an order number, product name, SKU or customer email.
            </p>
          ) : (
            <>
              {renderGroup("Pages", pages)}
              {renderGroup("Orders", orders)}
              {renderGroup("Products", products)}
              {renderGroup("Customers", customers)}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200/80 bg-surface-muted/50 px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-charcoal-light">
          <span className="flex items-center gap-3">
            <span>↑ ↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </span>
          <span>⌘K anywhere</span>
        </div>
      </div>
    </div>
  );
}
