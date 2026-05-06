import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
const DJANGO_API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const APP_URL = process.env.APP_URL || "https://studex.com.ng";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ detail: "Valid email required" }, { status: 400 });
    }

    // Ask Django to generate the reset token
    const djangoRes = await fetch(`${DJANGO_API}/api/auth/forgot-password/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": APP_URL,
      },
      body: JSON.stringify({ email }),
    });

    const raw = await djangoRes.text();
    console.log(`[forgot-password] Django ${djangoRes.status}:`, raw);

    if (!djangoRes.ok) {
      let err: Record<string, any> = {};
      try { err = JSON.parse(raw); } catch {}
      const msg =
        err.detail ||
        err.error ||
        err.message ||
        (Array.isArray(err.non_field_errors) && err.non_field_errors[0]) ||
        (Array.isArray(err.email) && err.email[0]) ||
        `Request failed (${djangoRes.status})`;
      return NextResponse.json({ detail: msg }, { status: djangoRes.status });
    }

    let data: Record<string, any> = {};
    try { data = JSON.parse(raw); } catch {}

    // Extract uid + token from whatever URL Django returned and build the frontend link
    let resetUrl: string | null = null;
    if (data.reset_url) {
      try {
        const parsed = new URL(data.reset_url);
        const uid = parsed.searchParams.get("uid");
        const token = parsed.searchParams.get("token");
        if (uid && token) {
          resetUrl = `${APP_URL}/reset-password?uid=${uid}&token=${token}`;
        }
      } catch {
        // reset_url wasn't a parseable URL — skip email sending
      }
    }

    if (!resetUrl) {
      // Django didn't return a reset_url — it may be sending its own email
      return NextResponse.json({ detail: "If that email is registered, a reset link is on its way." });
    }

    // Send the email via Resend
    const { error } = await resend.emails.send({
      from: "StudEx <noreply@studex.com.ng>",
      to: email,
      subject: "Reset your StudEx password",
      html: buildEmailHtml(resetUrl),
    });

    if (error) {
      console.error("Resend error:", error);
      // Don't expose internal errors — the token is still valid
    }

    return NextResponse.json({ detail: "If that email is registered, a reset link is on its way." });
  } catch (err) {
    console.error("forgot-password route error:", err);
    return NextResponse.json({ detail: "Something went wrong. Please try again." }, { status: 500 });
  }
}

function buildEmailHtml(resetUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your StudEx password</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e7e5e4;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header gradient -->
          <tr>
            <td style="background:linear-gradient(135deg,#0D9488 0%,#7C3AED 100%);padding:32px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;">StudEx</p>
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">Reset your password</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#57534e;font-size:15px;line-height:1.6;">
                Hey there! We received a request to reset the password for your StudEx account.
                Click the button below to choose a new password.
              </p>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}"
                      style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#0D9488 0%,#7C3AED 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:100px;letter-spacing:0.02em;">
                      Reset My Password →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#78716c;font-size:13px;line-height:1.6;">
                This link expires in <strong>1 hour</strong>. If you didn't request a password reset,
                you can safely ignore this email — your account remains secure.
              </p>

              <!-- Fallback URL -->
              <div style="margin-top:24px;padding:16px;background:#f5f5f4;border-radius:12px;border:1px solid #e7e5e4;">
                <p style="margin:0 0 6px;color:#78716c;font-size:12px;">Button not working? Paste this link into your browser:</p>
                <a href="${resetUrl}" style="color:#0D9488;font-size:12px;word-break:break-all;text-decoration:none;">${resetUrl}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f5f5f4;text-align:center;">
              <p style="margin:0;color:#a8a29e;font-size:12px;">© 2026 StudEx · studex.com.ng</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
