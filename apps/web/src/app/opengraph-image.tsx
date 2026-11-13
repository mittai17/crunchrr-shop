import { ImageResponse } from "next/og";

/**
 * Social card (OG / twitter:summary_large_image) — auto-wired by Next into
 * every page that doesn't define its own opengraph-image.
 * Uses the built-in satori font to avoid network fetches at build time.
 */
export const alt = "Crunchrr — limited streetwear drops";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#121212",
          backgroundImage:
            "radial-gradient(circle at 85% 15%, rgba(244, 91, 80, 0.22) 0%, rgba(18,18,18,0) 45%), radial-gradient(circle at 8% 92%, rgba(29, 209, 161, 0.14) 0%, rgba(18,18,18,0) 40%)",
          padding: "72px 84px",
        }}
      >
        {/* Top row: brand chip */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              border: "2px solid rgba(250, 248, 246, 0.18)",
              borderRadius: 999,
              padding: "12px 26px",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                backgroundColor: "#F45B50",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#121212",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              C
            </div>
            <div style={{ color: "#FAF8F6", fontSize: 30, letterSpacing: 2 }}>
              crunchrr
            </div>
          </div>
        </div>

        {/* Middle: headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#F45B50",
              fontSize: 26,
              letterSpacing: 8,
              marginBottom: 22,
              display: "flex",
            }}
          >
            STREETWEAR ARCHIVE — DROP 004 LIVE
          </div>
          <div
            style={{
              color: "#FAF8F6",
              fontSize: 108,
              lineHeight: 1.05,
              letterSpacing: -2,
              display: "flex",
            }}
          >
            Own the Edge.
          </div>
          <div
            style={{
              color: "#FAF8F6",
              fontSize: 108,
              lineHeight: 1.05,
              letterSpacing: -2,
              display: "flex",
            }}
          >
            Keep the Vibe.
          </div>
        </div>

        {/* Bottom row: spec strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "2px solid rgba(250, 248, 246, 0.14)",
            paddingTop: 26,
          }}
        >
          <div style={{ color: "rgba(250,248,246,0.65)", fontSize: 22, letterSpacing: 3, display: "flex" }}>
            480 GSM FLEECE · LIMITED BATCHES · NEVER RESTOCKED
          </div>
          <div
            style={{
              display: "flex",
              backgroundColor: "#1DD1A1",
              color: "#121212",
              fontSize: 22,
              fontWeight: 700,
              padding: "10px 24px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            PRINT-ON-DEMAND
          </div>
        </div>
      </div>
    ),
    size,
  );
}
