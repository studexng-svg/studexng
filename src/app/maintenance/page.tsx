export const metadata = {
  title: "StudEx — Under Maintenance",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  const eta = process.env.NEXT_PUBLIC_MAINTENANCE_ETA;

  return (
    <html lang="en">
      <head />
      <body
        style={{
          margin: 0,
          fontFamily: "'Inter', sans-serif",
          background: "#FFF8F0",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          color: "#1a1a2e",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "24px",
            padding: "56px 48px",
            maxWidth: "520px",
            width: "100%",
            textAlign: "center",
            boxShadow:
              "0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 60px -10px rgba(124,58,237,0.12)",
            border: "1px solid rgba(124,58,237,0.08)",
          }}
        >
          {/* Animated icon */}
          <div
            style={{
              width: "88px",
              height: "88px",
              background: "#EDE9FE",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 32px",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"
                fill="#7C3AED"
                opacity="0.25"
              />
              <path d="M12 6v6l4 2-1 1.73-5-2.73V6H12z" fill="#7C3AED" />
            </svg>
          </div>

          <p
            style={{
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#7C3AED",
              marginBottom: "6px",
            }}
          >
            StudEx
          </p>

          <h1
            style={{
              fontSize: "28px",
              fontWeight: 800,
              lineHeight: 1.25,
              marginBottom: "12px",
            }}
          >
            We'll be right back!
          </h1>

          <p
            style={{
              fontSize: "16px",
              color: "#6b7280",
              lineHeight: 1.6,
              marginBottom: "32px",
            }}
          >
            We're upgrading StudEx for you.
            <br />
            We'll be back shortly.
          </p>

          {eta && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "#EDE9FE",
                color: "#5B21B6",
                fontSize: "13px",
                fontWeight: 600,
                padding: "8px 18px",
                borderRadius: "100px",
                marginBottom: "32px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  background: "#7C3AED",
                  borderRadius: "50%",
                  display: "inline-block",
                }}
              />
              Back by {eta}
            </div>
          )}

          <div
            style={{
              height: "1px",
              background:
                "linear-gradient(90deg, transparent, #e5e7eb, transparent)",
              margin: "0 0 24px",
            }}
          />

          <p style={{ fontSize: "13.5px", color: "#6b7280" }}>
            Urgent? Email us at{" "}
            <a
              href="mailto:studex.ng@gmail.com"
              style={{
                color: "#7C3AED",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              studex.ng@gmail.com
            </a>
          </p>
        </div>

        <p style={{ marginTop: "32px", fontSize: "12px", color: "#9ca3af" }}>
          © 2025 StudEx. Nigeria&apos;s campus marketplace.
        </p>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; }
          @media (max-width: 480px) {
            h1 { font-size: 22px !important; }
            div[style*="padding: 56px"] { padding: 40px 28px !important; }
          }
        `}</style>
      </body>
    </html>
  );
}
