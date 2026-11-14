"use client";

/**
 * Admin API context — kept in its own module so chrome-level widgets
 * (command palette, alerts bell) can consume the fetcher without a
 * circular import back into chrome.tsx.
 */
import { createContext, useContext } from "react";
import type { AdminApi } from "@/lib/admin-client";

export const AdminApiContext = createContext<AdminApi | null>(null);

export function useAdminApi(): AdminApi {
  const api = useContext(AdminApiContext);
  if (!api) throw new Error("useAdminApi outside AdminChrome");
  return api;
}
