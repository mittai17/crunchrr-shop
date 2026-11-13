import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatUsd(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}
