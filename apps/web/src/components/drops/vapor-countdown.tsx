"use client";

/**
 * Vapor countdown — the vault clock.
 *
 * Digits are drawn as a field of grains on a 2D canvas: when a digit
 * changes, the outgoing glyph sublimates into monochrome grains that drift
 * up on a noise wind while the incoming digit condenses from the same cloud,
 * each grain spring-seeking its new glyph home.
 *
 * Built on the 21st.dev "Countdown Vapor Digits" concept, re-implemented
 * dependency-free for this codebase:
 *   - direct-DOM rAF loop (no React state on the hot path)
 *   - a real <time> element carries the machine-readable value; the canvas
 *     is aria-hidden so screen readers get exact digits, not pixels
 *   - prefers-reduced-motion draws static digits and skips the physics
 *   - the ink colour is read from the element's computed style, so the same
 *     component is legible on charcoal and on canvas
 */
import { useEffect, useRef, useState } from "react";

const GRAIN_PX = 2; // grain square size in CSS px
const STRIDE = 3; // px between alpha samples on the glyph raster
const MAX_GRAINS = 700; // per digit
const SPRING_K = 110; // s^-2 — spring constant for the condensation
const ZETA = 0.55; // damping ratio (<1 = soft overshoot)
const DRAG = 0.9; // per-frame velocity drag
const DT_MAX = 0.032; // s — clamp tab-switch jumps

/* ------------------------------------------------------------------ */
/* Deterministic value noise — house field, no dependencies.            */
/* ------------------------------------------------------------------ */

function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

type Props = {
  /** Remaining seconds — server-computed so the first paint is correct. */
  initialSeconds: number;
  /** Digit cell height in CSS px. */
  height?: number;
  className?: string;
  /** Unit captions under each group. */
  labels?: readonly [string, string, string] | null;
  /** Accessible name for the timer. */
  label?: string;
};

export function VaporCountdown({
  initialSeconds,
  height = 46,
  className,
  labels = ["HRS", "MIN", "SEC"],
  label = "Time remaining in the vault window",
}: Props) {
  const [painted, setPainted] = useState(false);
  const [text, setText] = useState(() => format(initialSeconds));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    const boot = async () => {
      const canvases = Array.from(
        root.querySelectorAll<HTMLCanvasElement>("[data-vapor-canvas]"),
      );
      if (canvases.length !== 3) return;

      // Make sure the display font is rasterised before the glyph sampling.
      try {
        await document.fonts.load(`700 ${Math.round(height * 0.78)}px "Space Grotesk"`);
      } catch {
        /* font API unavailable — fall back to the system sans */
      }
      if (cancelled) return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      type Cell = {
        homes: Float32Array;
        gx: Float32Array;
        gy: Float32Array;
        gvx: Float32Array;
        gvy: Float32Array;
        px: Float32Array; // vapour position
        py: Float32Array;
        vag: Float32Array;
        vlife: Float32Array;
        gc: number;
        vc: number;
        digit: string;
      };

      type Group = {
        canvas: HTMLCanvasElement;
        ctx: CanvasRenderingContext2D;
        cells: Cell[];
        w: number;
        h: number;
        font: string;
      };

      const groups: Group[] = canvases.map((canvas) => ({
        canvas,
        ctx: canvas.getContext("2d") as CanvasRenderingContext2D,
        cells: [0, 1].map(() => ({
          homes: new Float32Array(0),
          gx: new Float32Array(MAX_GRAINS),
          gy: new Float32Array(MAX_GRAINS),
          gvx: new Float32Array(MAX_GRAINS),
          gvy: new Float32Array(MAX_GRAINS),
          px: new Float32Array(MAX_GRAINS),
          py: new Float32Array(MAX_GRAINS),
          vag: new Float32Array(MAX_GRAINS),
          vlife: new Float32Array(MAX_GRAINS),
          gc: 0,
          vc: 0,
          digit: "",
        })),
        w: 0,
        h: 0,
        font: "",
      }));

      if (groups.some((g) => !g.ctx)) return;

      const rasterCache = new Map<string, Float32Array>();

      const rasterize = (digit: string, font: string, w: number, h: number) => {
        // Smaller clocks sample the glyph more densely so the digits still
        // read as digits; larger canvases keep the airy grain spacing.
        const stride = h <= 40 ? 2 : 3;
        const key = `${digit}|${font}|${Math.round(w)}x${Math.round(h)}`;
        const hit = rasterCache.get(key);
        if (hit) return hit;

        const off = document.createElement("canvas");
        off.width = Math.max(1, Math.ceil(w * dpr));
        off.height = Math.max(1, Math.ceil(h * dpr));
        const octx = off.getContext("2d");
        const points: number[] = [];
        if (octx) {
          octx.scale(dpr, dpr);
          octx.font = font;
          octx.textAlign = "center";
          octx.textBaseline = "middle";
          octx.fillStyle = "#fff";
          octx.fillText(digit, w / 2, h / 2);
          const data = octx.getImageData(0, 0, off.width, off.height).data;
          for (let y = 0; y < off.height; y += stride) {
            for (let x = 0; x < off.width; x += stride) {
              if (data[(y * off.width + x) * 4 + 3]! > 110) points.push(x / dpr, y / dpr);
            }
          }
        }
        const arr = new Float32Array(points);
        rasterCache.set(key, arr);
        return arr;
      };

      let ink = "#ffffff";
      const readInk = () => {
        ink = getComputedStyle(root).color || ink;
      };

      const measure = () => {
        groups.forEach((g) => {
          const rect = g.canvas.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          g.w = rect.width;
          g.h = rect.height;
          g.canvas.width = Math.max(1, Math.round(rect.width * dpr));
          g.canvas.height = Math.max(1, Math.round(rect.height * dpr));
          g.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          // Fit the display font to the cell: two digits must never touch,
          // so the glyph is measured and scaled to 86% of a half-cell.
          const cell = g.w / 2;
          let size = g.h * 0.78;
          g.ctx.font = `700 ${size}px "Space Grotesk", sans-serif`;
          const glyphWidth = g.ctx.measureText("0").width || size * 0.6;
          if (glyphWidth > cell * 0.86) {
            size = (size * cell * 0.86) / glyphWidth;
          }
          g.font = `700 ${Math.round(size * 10) / 10}px "Space Grotesk", sans-serif`;
        });
      };

      let remaining = initialSeconds;
      let raf = 0;
      let running = false;
      let last = 0;

      const cellWidth = (g: Group) => g.w / 2;

      const setDigit = (g: Group, index: number, digit: string) => {
        const cell = g.cells[index];
        if (!cell || cell.digit === digit || g.w === 0) return;
        const homes = rasterize(digit, g.font, cellWidth(g), g.h);

        // The outgoing glyph sublimates into vapour…
        const outgoing = cell.gc;
        cell.vc = Math.min(outgoing, MAX_GRAINS);
        for (let i = 0; i < cell.vc; i++) {
          cell.px[i] = cell.gx[i]! + (Math.random() - 0.5) * 6;
          cell.py[i] = cell.gy[i]! - Math.random() * 6;
          cell.vag[i] = 0;
          cell.vlife[i] = 0.85 + Math.random() * 0.5;
        }

        // …and the incoming digit condenses out of that same cloud.
        const count = Math.min(homes.length / 2, MAX_GRAINS);
        cell.homes = homes;
        cell.gc = count;
        for (let i = 0; i < count; i++) {
          const hx = homes[i * 2]!;
          const hy = homes[i * 2 + 1]!;
          const from = i < cell.vc;
          cell.gx[i] = from ? cell.px[i]! : hx + (Math.random() - 0.5) * 10;
          cell.gy[i] = from ? cell.py[i]! : hy + (Math.random() - 0.5) * 10;
          cell.gvx[i] = 0;
          cell.gvy[i] = 0;
        }
        cell.digit = digit;
      };

      const drawStatic = () => {
        groups.forEach((g) => {
          if (g.w === 0) return;
          g.ctx.clearRect(0, 0, g.w, g.h);
          g.ctx.fillStyle = ink;
          g.ctx.font = g.font;
          g.ctx.textAlign = "center";
          g.ctx.textBaseline = "middle";
          g.ctx.fillText(g.cells.map((c) => c.digit).join(""), g.w / 2, g.h / 2);
        });
      };

      const damp = 2 * ZETA * Math.sqrt(SPRING_K);

      const frame = (now: number) => {
        const dt = Math.min(Math.max((now - last) / 1000, 0), DT_MAX);
        last = now;
        let active = false;

        groups.forEach((g) => {
          if (g.w === 0) return;
          g.ctx.clearRect(0, 0, g.w, g.h);
          g.ctx.fillStyle = ink;

          g.cells.forEach((cell) => {
            for (let i = 0; i < cell.gc; i++) {
              let x = cell.gx[i]!;
              let y = cell.gy[i]!;
              let vx = cell.gvx[i]!;
              let vy = cell.gvy[i]!;
              const hx = cell.homes[i * 2]!;
              const hy = cell.homes[i * 2 + 1]!;

              vx = (vx + (SPRING_K * (hx - x) - damp * vx) * dt) * DRAG;
              vy = (vy + (SPRING_K * (hy - y) - damp * vy) * dt) * DRAG;
              x += vx * dt;
              y += vy * dt;
              cell.gx[i] = x;
              cell.gy[i] = y;
              cell.gvx[i] = vx;
              cell.gvy[i] = vy;

              if (
                Math.abs(x - hx) > 0.4 ||
                Math.abs(y - hy) > 0.4 ||
                Math.abs(vx) > 2 ||
                Math.abs(vy) > 2
              ) {
                active = true;
              }

              g.ctx.globalAlpha = 0.92;
              g.ctx.fillRect(x - GRAIN_PX / 2, y - GRAIN_PX / 2, GRAIN_PX, GRAIN_PX);
            }

            for (let i = 0; i < cell.vc; i++) {
              const age = cell.vag[i]! + dt;
              cell.vag[i] = age;
              if (age >= cell.vlife[i]!) continue;
              active = true;
              const sway = (vnoise(cell.px[i]! * 0.02, age * 1.6) - 0.5) * 26;
              cell.px[i] = cell.px[i]! + sway * dt;
              cell.py[i] = cell.py[i]! - 16 * dt;
              g.ctx.globalAlpha = Math.max(0, 1 - age / cell.vlife[i]!) * 0.5;
              g.ctx.fillRect(
                cell.px[i]! - GRAIN_PX / 2,
                cell.py[i]! - GRAIN_PX / 2,
                GRAIN_PX,
                GRAIN_PX,
              );
            }
          });

          g.ctx.globalAlpha = 1;
        });

        // Idle out of the loop entirely; a digit change wakes it again.
        if (active) {
          raf = requestAnimationFrame(frame);
        } else {
          running = false;
        }
      };

      const ensureLoop = () => {
        if (reduced || running) return;
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      };

      const applyDigits = (value: string) => {
        const parts = value.split(":");
        groups.forEach((g, gi) => {
          const pair = parts[gi] ?? "00";
          setDigit(g, 0, pair[0] ?? "0");
          setDigit(g, 1, pair[1] ?? "0");
        });
        if (reduced) drawStatic();
        else ensureLoop();
      };

      measure();
      readInk();
      applyDigits(format(remaining));
      setPainted(true);

      const timer = window.setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        const next = format(remaining);
        setText(next);
        applyDigits(next);
      }, 1000);

      const onResize = () => {
        measure();
        readInk();
        groups.forEach((g) => g.cells.forEach((cell) => (cell.digit = "")));
        applyDigits(format(remaining));
      };

      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.clearInterval(timer);
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
      };
    };

    void boot();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [initialSeconds, height]);

  const [hh, mm, ss] = text.split(":");

  return (
    <div ref={rootRef} className={className} role="timer" aria-label={label}>
      {/* Machine-readable truth for assistive tech. */}
      <time dateTime={`PT${hh}H${mm}M${ss}S`} className="sr-only">
        {text}
      </time>

      <div className="relative flex items-end gap-2 sm:gap-3">
        {/* Pre-paint fallback text; hidden once the canvas has drawn. */}
        <span
          aria-hidden="true"
          className={
            painted
              ? "pointer-events-none absolute inset-0 hidden"
              : "pointer-events-none absolute inset-0 flex items-center justify-center font-display text-2xl font-bold tabular-nums"
          }
        >
          {text}
        </span>

        <Group label={labels?.[0]} height={height} />
        <Separator height={height} />
        <Group label={labels?.[1]} height={height} />
        <Separator height={height} />
        <Group label={labels?.[2]} height={height} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Group({ label, height }: { label?: string; height: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <canvas
        data-vapor-canvas
        aria-hidden="true"
        style={{ height: `${height}px`, width: `${Math.round(height * 1.18)}px` }}
        className="block"
      />
      {label ? (
        <span className="font-display text-[9px] font-bold uppercase tracking-[0.2em] opacity-70">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function Separator({ height }: { height: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-col items-center justify-center gap-1.5"
      style={{ height: `${height}px`, marginTop: `-${Math.round(height * 0.18)}px` }}
    >
      <span className="block rounded-[1px] bg-current" style={{ width: 4, height: 4 }} />
      <span className="block rounded-[1px] bg-current" style={{ width: 4, height: 4 }} />
    </span>
  );
}

function format(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}
