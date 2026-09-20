import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: process.env.REGION });

export async function sendMemberVerificationQrEmail(
    toAddress: string,
    firstName: string,
    clubName: string,
    clubAccountId: string,
    memberUserId: string,
): Promise<void> {
    const verificationUrl = `https://${process.env.DOMAIN as string}/clubs/${clubAccountId}/member-verification/${memberUserId}?clubName=${encodeURIComponent(clubName)}`;

    // Imported lazily: only lambdas with the qrcode layer call this, but every lambda bundles function_helpers.
    const QRCode = (await import("qrcode")).default;

    const pngBuffer = await QRCode.toBuffer(verificationUrl, {
        width: 220,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
    });
    const pngBase64 = pngBuffer.toString("base64");

    const htmlBody = `<html><body style="margin:0;padding:0;background:#f7f7f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 24px 16px 24px;">
          <h1 style="margin:0 0 8px 0;font-size:20px;color:#111827;">Your Membership QR Code</h1>
          <p style="margin:0;color:#6b7280;font-size:14px;">Hi ${firstName}, your registration for <strong>${clubName}</strong> has been submitted.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 24px 16px 24px;">
          <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Your QR code</p>
          <img src="cid:qrcode@clubby" alt="Member Verification QR Code" width="180" style="display:block;border-radius:8px;" />
          <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">Show this to a club official to verify your membership.</p>
        </td></tr>
        <tr><td style="padding:0 24px 24px 24px;">
          <a href="${verificationUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 20px;font-weight:600;font-size:14px;">Open verification page</a>
        </td></tr>
        <tr><td style="padding:16px 24px 24px 24px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;color:#9ca3af;">Need help? Email us at <a href="mailto:admin@${process.env.DOMAIN as string}" style="color:#2563eb;text-decoration:none;">admin@${process.env.DOMAIN as string}</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const htmlBase64 = Buffer.from(htmlBody, "utf-8").toString("base64");
    const boundary = "mcs_qr_boundary_001";

    const rawEmail = [
        `From: registrations@${process.env.DOMAIN as string}`,
        `To: ${toAddress}`,
        `Subject: Your Membership QR Code | ${clubName}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/related; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        htmlBase64,
        "",
        `--${boundary}`,
        "Content-Type: image/png",
        "Content-Transfer-Encoding: base64",
        "Content-ID: <qrcode@clubby>",
        "Content-Disposition: inline; filename=qrcode.png",
        "",
        pngBase64,
        "",
        `--${boundary}--`,
    ].join("\r\n");

    await sesClient.send(
        new SendRawEmailCommand({
            RawMessage: { Data: new Uint8Array(Buffer.from(rawEmail, "utf-8")) },
        }),
    );
}
