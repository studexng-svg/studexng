import { ImageResponse } from "next/og";

export const runtime = "edge";
export const revalidate = 60;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default async function Image({ params }: { params: { id: string } }) {
  let listing: any = null;

  try {
    const res = await fetch(`${API_URL}/api/services/listings/${params.id}/`);
    if (res.ok) listing = await res.json();
  } catch {}

  const title = listing?.title || "Campus Listing";
  const price = listing?.price ? Number(listing.price) : null;
  const discount = listing?.discount_percent ? Number(listing.discount_percent) : 0;
  const salePrice = price && discount > 0 ? Math.round(price * (1 - discount / 100)) : null;
  const vendor = listing?.vendor?.business_name || listing?.vendor?.username || "StudEx Vendor";
  const imageUrl = listing?.image || null;
  const campus = (listing?.campus || "").toUpperCase();

  const displayPrice = salePrice
    ? `₦${salePrice.toLocaleString("en-NG")}`
    : price
    ? `₦${price.toLocaleString("en-NG")}`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          position: "relative",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          background: "#0b1a18",
          overflow: "hidden",
        }}
      >
        {/* Product image — left half */}
        {imageUrl ? (
          <img
            src={imageUrl}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "50%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "50%",
              height: "100%",
              background: "linear-gradient(135deg, #0d9488 0%, #7c3aed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 72, color: "rgba(255,255,255,0.3)" }}>🛍️</div>
          </div>
        )}

        {/* Fade overlay on image edge */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "35%",
            width: "20%",
            height: "100%",
            background: "linear-gradient(to right, transparent, #0b1a18)",
          }}
        />

        {/* Right panel */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "55%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "48px 52px",
            gap: 20,
          }}
        >
          {/* Campus pill */}
          {campus && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(13,148,136,0.15)",
                border: "1px solid rgba(13,148,136,0.4)",
                borderRadius: 100,
                padding: "6px 16px",
                width: "fit-content",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#0d9488",
                }}
              />
              <span style={{ color: "#0d9488", fontSize: 14, fontWeight: 700, letterSpacing: 2 }}>
                {campus}
              </span>
            </div>
          )}

          {/* Title */}
          <div
            style={{
              color: "#ffffff",
              fontSize: title.length > 40 ? 36 : 44,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: -0.5,
            }}
          >
            {title.length > 60 ? title.slice(0, 58) + "…" : title}
          </div>

          {/* Vendor */}
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>
            by @{vendor}
          </div>

          {/* Price row */}
          {displayPrice && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
              {/* Sale price */}
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  background: "linear-gradient(90deg, #0d9488, #7c3aed)",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {displayPrice}
              </div>

              {/* Strikethrough original + badge */}
              {salePrice && price && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontSize: 22,
                      textDecoration: "line-through",
                    }}
                  >
                    ₦{price.toLocaleString("en-NG")}
                  </div>
                  <div
                    style={{
                      background: "#ef4444",
                      color: "#ffffff",
                      fontWeight: 800,
                      fontSize: 16,
                      padding: "4px 12px",
                      borderRadius: 100,
                    }}
                  >
                    -{discount}% OFF
                  </div>
                </div>
              )}
            </div>
          )}

          {/* StudEx branding */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #0d9488, #7c3aed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                color: "white",
                fontWeight: 900,
              }}
            >
              S
            </div>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, fontWeight: 600 }}>
              StudEx · Campus Marketplace
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
