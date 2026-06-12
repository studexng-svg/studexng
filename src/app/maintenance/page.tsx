export const metadata = {
  title: "StudEx - Under Maintenance",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Inter', sans-serif;
          background: #FFF8F0;
        }

        @keyframes spin-second {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spin-minute {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spin-hour {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.15; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.35); }
          50%       { box-shadow: 0 0 0 14px rgba(124,58,237,0); }
        }

        .clock-wrap {
          animation: glow-pulse 2.4s ease-in-out infinite;
        }
        .hand-second {
          transform-origin: 50px 50px;
          animation: spin-second 2s linear infinite;
        }
        .hand-minute {
          transform-origin: 50px 50px;
          animation: spin-minute 30s linear infinite;
        }
        .hand-hour {
          transform-origin: 50px 50px;
          animation: spin-hour 360s linear infinite;
        }
        .blink-dot {
          animation: blink 1.2s ease-in-out infinite;
        }

        @media (max-width: 480px) {
          .card { padding: 40px 24px !important; }
          .card h1 { font-size: 22px !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#FFF8F0",
        fontFamily: "'Inter', sans-serif",
        color: "#1a1a2e",
      }}>
        <div className="card" style={{
          background: "#fff",
          borderRadius: "24px",
          padding: "52px 48px",
          maxWidth: "500px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.04), 0 24px 64px -10px rgba(124,58,237,0.13)",
          border: "1px solid rgba(124,58,237,0.09)",
        }}>

          {/* Animated clock */}
          <div className="clock-wrap" style={{
            width: "96px",
            height: "96px",
            background: "#EDE9FE",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
          }}>
            <svg width="60" height="60" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Outer ring */}
              <circle cx="50" cy="50" r="46" fill="#EDE9FE" />
              <circle cx="50" cy="50" r="46" stroke="#7C3AED" strokeWidth="3.5" opacity="0.25" fill="none" />

              {/* Hour markers */}
              {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => {
                const rad = (deg - 90) * Math.PI / 180;
                const x1 = 50 + 38 * Math.cos(rad);
                const y1 = 50 + 38 * Math.sin(rad);
                const x2 = 50 + (i % 3 === 0 ? 30 : 34) * Math.cos(rad);
                const y2 = 50 + (i % 3 === 0 ? 30 : 34) * Math.sin(rad);
                return (
                  <line
                    key={deg}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#7C3AED"
                    strokeWidth={i % 3 === 0 ? 3 : 1.5}
                    strokeOpacity={i % 3 === 0 ? 0.6 : 0.3}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Hour hand */}
              <line
                className="hand-hour"
                x1="50" y1="50" x2="50" y2="24"
                stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" opacity="0.9"
              />

              {/* Minute hand */}
              <line
                className="hand-minute"
                x1="50" y1="50" x2="50" y2="16"
                stroke="#7C3AED" strokeWidth="3.5" strokeLinecap="round"
              />

              {/* Second hand */}
              <line
                className="hand-second"
                x1="50" y1="55" x2="50" y2="13"
                stroke="#C4B5FD" strokeWidth="2" strokeLinecap="round"
              />

              {/* Center cap */}
              <circle cx="50" cy="50" r="4.5" fill="#7C3AED" />
              <circle cx="50" cy="50" r="2" fill="#fff" />
            </svg>
          </div>

          {/* Brand */}
          <p style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#7C3AED",
            margin: "0 0 10px",
          }}>
            StudEx
          </p>

          {/* Heading */}
          <h1 style={{
            fontSize: "26px",
            fontWeight: 800,
            lineHeight: 1.25,
            margin: "0 0 14px",
            color: "#1a1a2e",
          }}>
            We&apos;ll be right back!
          </h1>

          {/* Sub text */}
          <p style={{
            fontSize: "15px",
            color: "#6b7280",
            lineHeight: 1.65,
            margin: "0 0 30px",
          }}>
            StudEx is currently undergoing scheduled maintenance to improve your experience.<br />
            We&apos;ll be back shortly. Thank you for your patience!
          </p>

          {/* Status pill */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "#EDE9FE",
            color: "#5B21B6",
            fontSize: "13px",
            fontWeight: 600,
            padding: "9px 20px",
            borderRadius: "100px",
            marginBottom: "30px",
          }}>
            <span className="blink-dot" style={{
              width: "8px",
              height: "8px",
              background: "#7C3AED",
              borderRadius: "50%",
              display: "inline-block",
              flexShrink: 0,
            }} />
            Maintenance is ongoing
          </div>

          {/* Divider */}
          <div style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent, #e5e7eb, transparent)",
            margin: "0 0 24px",
          }} />

          {/* Contact */}
          <p style={{ fontSize: "13.5px", color: "#6b7280" }}>
            Reach us at{" "}
            <a
              href="mailto:studex.ng@gmail.com"
              style={{ color: "#7C3AED", fontWeight: 600, textDecoration: "none" }}
            >
              studex.ng@gmail.com
            </a>
          </p>
        </div>

        <p style={{ marginTop: "28px", fontSize: "12px", color: "#9ca3af" }}>
          © 2026 StudEx. Nigeria&apos;s campus marketplace.
        </p>
      </div>
    </>
  );
}
