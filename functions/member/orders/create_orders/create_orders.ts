import { randomUUID } from "crypto";
import { SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import QRCode from "qrcode";
import {
  createResponse,
  deconstructEvent,
  addItem,
  getItem,
} from "./function_helpers";

const sesClient = new SESClient({ region: process.env.REGION });

async function sendOrderConfirmationEmail(
  toAddress: string,
  firstName: string,
  clubName: string,
  clubAccountId: string,
  orderId: string,
  items: Array<{ name?: string; quantity?: number; price?: number }>,
  totalAmount: number,
  currency: string,
): Promise<void> {
  const qrValue = `${orderId}|${clubAccountId}`;
  const orderRef = orderId.slice(0, 8).toUpperCase();
  const orderUrl = `https://${process.env.DOMAIN as string}/myclubs/${clubAccountId}/orders/${orderId}`;

  let pngBase64: string;
  try {
    const pngBuffer = await QRCode.toBuffer(qrValue, {
      width: 220,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    pngBase64 = pngBuffer.toString("base64");
  } catch (err) {
    console.error("QR code generation failed:", err);
    return;
  }

  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#374151;font-size:14px;">${item.name ?? "Item"}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:#374151;font-size:14px;text-align:center;">${item.quantity ?? 1}</td>
        </tr>`,
    )
    .join("");

  const htmlBody = `<html><body style="margin:0;padding:0;background:#f7f7f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 24px 16px 24px;">
          <h1 style="margin:0 0 8px 0;font-size:20px;color:#111827;">Order Confirmed</h1>
          <p style="margin:0;color:#6b7280;font-size:14px;">Thank you, ${firstName}! Your order for <strong>${clubName}</strong> has been placed.</p>
        </td></tr>
        <tr><td style="padding:0 24px 16px 24px;">
          <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Order reference</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#111827;font-family:monospace;">#${orderRef}</p>
        </td></tr>
        <tr><td align="center" style="padding:0 24px 16px 24px;">
          <p style="margin:0 0 8px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Your QR code</p>
          <img src="cid:qrcode@clubby" alt="Order QR Code" width="180" style="display:block;border-radius:8px;" />
          <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">Show this at the venue to redeem your order.</p>
        </td></tr>
        <tr><td style="padding:0 24px 16px 24px;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <th style="padding:0 0 8px 0;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Item</th>
              <th style="padding:0 0 8px 0;text-align:center;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Qty</th>
            </tr>
            ${itemRows}
          </table>
        </td></tr>
        <tr><td style="padding:0 24px 16px 24px;">
          <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;">Total</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">${currency} ${(totalAmount / 100).toFixed(2)}</p>
        </td></tr>
        <tr><td style="padding:0 24px 24px 24px;">
          <a href="${orderUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 20px;font-weight:600;font-size:14px;">Go to order</a>
        </td></tr>
        <tr><td style="padding:16px 24px 24px 24px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">Payment is required to complete your order. If you have not paid yet, please return to the shop.</p>
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
    `Subject: Order Confirmed - #${orderRef} | ${clubName}`,
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

  try {
    await sesClient.send(
      new SendRawEmailCommand({
        RawMessage: { Data: new Uint8Array(Buffer.from(rawEmail, "utf-8")) },
      }),
    );
  } catch (error) {
    console.error("Error sending order confirmation email:", error);
  }
}

async function addToTransactionsTable(
  club_account_id: string,
  first_name: string,
  surname: string,
  transaction_id: string,
  user_id: string,
  order_amount: number,
  order_id: string,
) {
  await addItem(process.env.TRANSACTIONS_TABLE_NAME as string, {
    club_account_id: club_account_id,
    name: `${first_name} ${surname}`,
    transaction_id: transaction_id,
    order_id: order_id,
    user_id: user_id as string,
    amount_paid: 0,
    club_income: true,
    amount: order_amount,
    creation_date: Date.now(),
    lifecycle: {
      [Date.now()]: {
        description: "Order submission",
        amount: order_amount,
        type: "SUBMISSION",
      },
    },
    type: "ORDER",
    status: "PENDING",
  });
}

export const handler = async (event: any) => {
  const { origin, body, query_string_params, user_id } =
    deconstructEvent(event);

  try {
    if (!body?.club_account_id || typeof body.club_account_id !== "string") {
      return createResponse(
        400,
        { message: "Invalid or missing club_account_id." },
        origin,
      );
    }

    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return createResponse(
        400,
        { message: "Invalid or empty items array." },
        origin,
      );
    }

    if (typeof body?.total_amount !== "number" || body.total_amount <= 0) {
      return createResponse(
        400,
        { message: "Invalid total_amount provided." },
        origin,
      );
    }

    if (typeof body?.total_items !== "number" || body.total_items <= 0) {
      return createResponse(
        400,
        { message: "Invalid total_items provided." },
        origin,
      );
    }

    const [user, club] = await Promise.all([
      getItem(process.env.USERS_TABLE_NAME as string, {
        user_type: "MEMBER",
        user_id: user_id as string,
      }),
      getItem(process.env.CLUB_TABLE_NAME as string, {
        club_account_id: body.club_account_id,
      }),
    ]);

    if (!user) {
      return createResponse(400, { message: "User not found." }, origin);
    }

    for (const item of body.items) {
      if (
        !item.product_id ||
        !item.name ||
        typeof item.price !== "number" ||
        typeof item.quantity !== "number" ||
        item.quantity <= 0
      ) {
        return createResponse(
          400,
          { message: "Invalid item in items array." },
          origin,
        );
      }
    }

    const order_id = randomUUID();
    const created_date = Math.floor(Date.now() / 1000);

    const transaction_id = randomUUID();

    for (const item of body.items) {
      item["fulfillment_status"] = "NOT_PROCESSED";
      item["fulfillment_quantity"] = 0;
    }

    const orderItem = {
      order_id,
      transaction_id,
      first_name: user.first_name,
      surname: user.surname,
      club_account_id: body.club_account_id,
      user_id: user_id as string,
      items: body.items,
      total_amount: body.total_amount,
      total_items: body.total_items,
      payment_status: "PENDING",
      fulfillment_status: "NOT_PROCESSED",
      order_confirmed_by_admin: false,
      created_date,
      amount_paid: 0,
    };

    await addItem(process.env.ORDER_TABLE_NAME!, orderItem);
    await addToTransactionsTable(
      body.club_account_id,
      user.first_name,
      user.surname,
      transaction_id,
      user_id as string,
      body.total_amount,
      order_id,
    );

    if (user.email) {
      await sendOrderConfirmationEmail(
        user.email,
        user.first_name,
        club?.club_name ?? "",
        body.club_account_id,
        order_id,
        body.items,
        body.total_amount,
        club?.currency ?? "ZAR",
      );
    }

    return createResponse(
      200,
      {
        message:
          "Order created successfully. Please return to the Shop to view your order.",
        order_id,
      },
      origin,
    );
  } catch (error: any) {
    console.error("Create order error:", error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
