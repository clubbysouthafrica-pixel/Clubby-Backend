import { AdminCreateUserCommand, AdminGetUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import {
  createResponse,
  deconstructEvent,
  addItem,
  getItem,
  updateItem,
} from "./function_helpers";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const sesClient = new SESClient({ region: process.env.REGION });

function generateCognitoPassword(minLength: number = 8): string {
  const lowerChars = "abcdefghijklmnopqrstuvwxyz";
  const upperChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digitChars = "0123456789";
  const allChars = lowerChars + upperChars + digitChars;

  const getRandomChar = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  const passwordChars = [
    getRandomChar(lowerChars),
    getRandomChar(upperChars),
    getRandomChar(digitChars),
  ];

  for (let i = passwordChars.length; i < minLength; i++) {
    passwordChars.push(getRandomChar(allChars));
  }

  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join("");
}

function validateRequestBody(body: any) {
  if (
    !body?.club_account_id ||
    !body?.email ||
    !body?.first_name ||
    !body?.surname ||
    !Array.isArray(body?.items) ||
    body.items.length === 0
  ) {
    return "club_account_id, email, first_name, surname and items are required.";
  }

  if (
    typeof body.club_account_id !== "string" ||
    typeof body.email !== "string" ||
    typeof body.first_name !== "string" ||
    typeof body.surname !== "string"
  ) {
    return "club_account_id, email, first_name and surname must be strings.";
  }

  if (typeof body?.email_opt_in !== "boolean") {
    return "email_opt_in must be a boolean.";
  }

  if (typeof body?.total_amount !== "number" || body.total_amount <= 0) {
    return "Invalid total_amount provided.";
  }

  if (typeof body?.total_items !== "number" || body.total_items <= 0) {
    return "Invalid total_items provided.";
  }

  for (const item of body.items) {
    if (
      !item?.product_id ||
      !item?.name ||
      typeof item.price !== "number" ||
      typeof item.quantity !== "number" ||
      item.quantity <= 0
    ) {
      return "Invalid item in items array.";
    }
  }

  return null;
}

async function sendAccountCreatedEmail(
  toAddress: string,
  firstName: string,
  password: string,
  clubName: string,
): Promise<void> {
  const emailSubject = "Your Clubby Account Has Been Created";
  const loginUrl = `https://${process.env.DOMAIN as string}/login?email=${encodeURIComponent(toAddress)}&tempPassword=${encodeURIComponent(password)}`;

  const emailBody = `
    <html>
      <body style="margin:0;padding:0;background:#f7f7f9;font-family:Arial, Helvetica, sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 0 24px;">
                    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:28px;color:#111827;">Welcome to Clubby, ${firstName}!</h1>
                    <p style="margin:0 0 16px 0;line-height:1.6;">We created your Clubby member account while placing your order for <strong>${clubName}</strong>. You can use it to view your orders and manage your membership.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 0 24px;">
                    <p style="margin:0 0 12px 0;line-height:1.6;">Click the button below to activate your account and set up your password.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 16px;font-weight:600;">Activate Your Account</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <p style="margin:0 0 12px 0;line-height:1.6;color:#374151;"><strong>We recommend using the button above for the easiest login experience.</strong></p>
                    <p style="margin:0 0 12px 0;line-height:1.6;color:#374151;">If you prefer, you can also sign in manually with the credentials below:</p>
                    <div style="background:#f3f4f6;border-left:4px solid #2563eb;padding:12px;border-radius:4px;margin:12px 0;">
                      <p style="margin:0 0 8px 0;line-height:1.6;color:#1f2937;"><strong>Email:</strong> ${toAddress}</p>
                      <p style="margin:0;line-height:1.6;color:#1f2937;"><strong>Temporary Password:</strong> ${password}</p>
                    </div>
                    <p style="margin:8px 0 0 0;line-height:1.6;color:#374151;">Security tip: For your protection, please change your password after your first login and keep your credentials confidential.</p>
                    <p style="margin:8px 0 0 0;line-height:1.6;color:#374151;">Need help? Email us at <a href="mailto:admin@${process.env.DOMAIN as string}" style="color:#2563eb;text-decoration:none;">admin@${process.env.DOMAIN as string}</a>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;border-top:1px solid #e5e7eb;">
                    <p style="margin:12px 0 0 0;line-height:1.6;color:#6b7280;">Welcome to Clubby!<br/>The Clubby Team</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`;

  try {
    await sesClient.send(new SendEmailCommand({
      Destination: {
        ToAddresses: [toAddress],
      },
      Message: {
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: emailBody,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: emailSubject,
        },
      },
      Source: `registrations@${process.env.DOMAIN as string}`,
    }));
  } catch (error) {
    console.error("Error sending account created email:", error);
  }
}

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

async function ensureUserRecord(
  userId: string,
  email: string,
  firstName: string,
  surname: string,
  emailOptIn: boolean,
) {
  const existingUser = await getItem(process.env.USERS_TABLE_NAME as string, {
    user_type: process.env.USER_TYPE as string,
    user_id: userId,
  });

  if (!existingUser) {
    await addItem(process.env.USERS_TABLE_NAME as string, {
      user_type: process.env.USER_TYPE as string,
      user_id: userId,
      email,
      first_name: firstName,
      surname,
      email_opt_in: emailOptIn,
      onboarded: false,
    });
    return {
      first_name: firstName,
      surname,
    };
  }

  await updateItem(
    process.env.USERS_TABLE_NAME as string,
    {
      user_type: process.env.USER_TYPE as string,
      user_id: userId,
    },
    "SET #email = :email, #email_opt_in = :email_opt_in",
    {
      "#email": "email",
      "#email_opt_in": "email_opt_in",
    },
    {
      ":email": email,
      ":email_opt_in": emailOptIn,
    },
  );

  return {
    first_name: existingUser.first_name ?? firstName,
    surname: existingUser.surname ?? surname,
  };
}

async function ensureClubbyUser(
  email: string,
  firstName: string,
  surname: string,
  clubName: string,
  emailOptIn: boolean,
): Promise<{ user_id: string; first_name: string; surname: string }> {
  const password = generateCognitoPassword();

  try {
    const createUserResponse = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
        ],
        MessageAction: "SUPPRESS",
      }),
    );

    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: email,
        Password: password,
        Permanent: false,
      }),
    );

    const userSub = createUserResponse.User?.Attributes?.find((attr) => attr.Name === "sub")?.Value;
    if (!userSub) {
      throw new Error("UserSub not found in response");
    }

    const userRecord = await ensureUserRecord(userSub, email, firstName, surname, emailOptIn);
    await sendAccountCreatedEmail(email, userRecord.first_name, password, clubName);

    return {
      user_id: userSub,
      first_name: userRecord.first_name,
      surname: userRecord.surname,
    };
  } catch (error: any) {
    if (error?.name !== "UsernameExistsException") {
      throw error;
    }

    const existingUser = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: email,
      }),
    );

    const userSub = existingUser.UserAttributes?.find((attr) => attr.Name === "sub")?.Value;
    if (!userSub) {
      throw new Error("Issue retrieving existing user.");
    }

    const userRecord = await ensureUserRecord(userSub, email, firstName, surname, emailOptIn);

    return {
      user_id: userSub,
      first_name: userRecord.first_name,
      surname: userRecord.surname,
    };
  }
}

async function upsertClubMember(
  clubAccountId: string,
  userId: string,
  email: string,
  firstName: string,
  surname: string,
  emailOptIn: boolean,
  club: Record<string, any>,
) {
  const existingClubMember = await getItem(process.env.CLUB_MEMBER_TABLE_NAME as string, {
    club_account_id: clubAccountId,
    user_id: userId,
  });

  if (!existingClubMember) {
    await addItem(process.env.CLUB_MEMBER_TABLE_NAME as string, {
      club_account_id: clubAccountId,
      resubmission_required: false,
      non_registration: true,
      user_id: userId,
      member_email: email,
      member_first_name: firstName,
      member_surname: surname,
      email_opt_in: emailOptIn,
      registered: false,
      registration_payment_reference: `${firstName} ${surname}`,
      currency: club.currency,
      club_name: club.club_name,
      season_cycle: club.season_cycle,
    });
    return;
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
    club_account_id,
    name: `${first_name} ${surname}`,
    transaction_id,
    order_id,
    user_id,
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
  const { origin, body } = deconstructEvent(event, false);

  try {
    const validationMessage = validateRequestBody(body);
    if (validationMessage) {
      return createResponse(400, { message: validationMessage }, origin);
    }

    const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
      club_account_id: body.club_account_id,
    });

    if (!club) {
      return createResponse(404, { message: "Club not found." }, origin);
    }

    if (club.public_shop !== true) {
      return createResponse(403, { message: "This club does not allow public orders." }, origin);
    }

    const email = body.email.trim().toLowerCase();
    const ensuredUser = await ensureClubbyUser(
      email,
      body.first_name,
      body.surname,
      club.club_name,
      body.email_opt_in,
    );

    await upsertClubMember(
      body.club_account_id,
      ensuredUser.user_id,
      email,
      ensuredUser.first_name,
      ensuredUser.surname,
      body.email_opt_in,
      club,
    );

    const order_id = randomUUID();
    const transaction_id = randomUUID();
    const created_date = Math.floor(Date.now() / 1000);

    for (const item of body.items) {
      item.fulfillment_status = "NOT_PROCESSED";
      item.fulfillment_quantity = 0;
    }

    await addItem(process.env.ORDER_TABLE_NAME as string, {
      order_id,
      transaction_id,
      first_name: ensuredUser.first_name,
      surname: ensuredUser.surname,
      club_account_id: body.club_account_id,
      user_id: ensuredUser.user_id,
      items: body.items,
      total_amount: body.total_amount,
      total_items: body.total_items,
      payment_status: "PENDING",
      fulfillment_status: "NOT_PROCESSED",
      order_confirmed_by_admin: false,
      created_date,
      amount_paid: 0,
    });

    await addToTransactionsTable(
      body.club_account_id,
      ensuredUser.first_name,
      ensuredUser.surname,
      transaction_id,
      ensuredUser.user_id,
      body.total_amount,
      order_id,
    );

    await sendOrderConfirmationEmail(
      email,
      ensuredUser.first_name,
      club.club_name,
      body.club_account_id,
      order_id,
      body.items,
      body.total_amount,
      club.currency ?? "ZAR",
    );

    return createResponse(
      200,
      {
        message: "Order created successfully. Please return to the Shop to view your order.",
        transaction_id: transaction_id,
        user_id: ensuredUser.user_id,
        order_id: order_id,
      },
      origin,
    );
  } catch (error: any) {
    console.error("Public create order error:", error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};