import {
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent, getItem, addItem } from "./function_helpers";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const sesClient = new SESClient({ region: process.env.REGION });

export async function sendTemporaryPasswordResetEmail(
    toAddress: string,
    tempPassword: string,
): Promise<void> {
    const emailSubject = "Temporary password reset";
    const emailBody = `
    <html>
      <body style="margin:0;padding:0;background:#f7f7f9;font-family: Arial, Helvetica, sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 0 24px;">
                    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:28px;color:#111827;">Password Reset Request</h1>
                    <p style="margin:0 0 16px 0;line-height:1.6;">We received a request to reset your password for your Clubby account. Your temporary password is ready to use.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 0 24px;">
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:16px;">
                      <p style="margin:0 0 8px 0;font-weight:bold;color:#111827;">Your login credentials</p>
                      <p style="margin:0 0 8px 0;line-height:1.6;"><strong>Username:</strong> ${toAddress}</p>
                      <p style="margin:0;line-height:1.6;"><strong>Temporary password:</strong> ${tempPassword}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 0 24px;">
                    <p style="margin:0 0 12px 0;line-height:1.6;">Next steps:</p>
                    <ol style="margin:0 0 16px 20px;padding:0;line-height:1.8;">
                      <li>Open the member portal using the button below.</li>
                      <li>Sign in with your email and the temporary password above.</li>
                      <li>Follow the prompt to create a new secure password.</li>
                    </ol>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <a href="https://${process.env.DOMAIN as string}/login" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 16px;font-weight:600;">Go to Member Login</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <p style="margin:0 0 8px 0;line-height:1.6;color:#374151;">Security tip: This temporary password expires after your first use. Please change it to a secure password that only you know.</p>
                    <p style="margin:0;line-height:1.6;color:#374151;">If you did not request a password reset, please contact us at <a href="mailto:admin@${process.env.DOMAIN as string}" style="color:#2563eb;text-decoration:none;">admin@${process.env.DOMAIN as string}</a>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;border-top:1px solid #e5e7eb;">
                    <p style="margin:12px 0 0 0;line-height:1.6;color:#6b7280;">Best regards,<br/>The Clubby Team</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`;

    const command = new SendEmailCommand({
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
        Source: `admin@${process.env.DOMAIN as string}`,
    });

    try {
        await sesClient.send(command);
        console.log(`✅ Email sent to ${toAddress}`);
    } catch (err) {
        console.error("❌ Error sending email:", err);
        throw err;
    }
}

function generateCognitoPassword(minLength: number = 8): string {
    const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
    const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digitChars = '0123456789';
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

    return passwordChars.join('');
}

export const handler = async (event: any) => {

  const { origin, body, query_string_params } = deconstructEvent(event, false);

  try {

    if (body?.username == null) {
      return createResponse(400, { message: 'Username required.' }, origin);
    }
    
    const item = await getItem(
      process.env.EMAIL_RATE_LIMITER_TABLE_NAME as string,
      {
        user_id: body.username,
        feature: "RESET_TEMPORARY_PASSWORD"
      }
    );
    if (item) {
        return createResponse(429, { message: "A credential reset request has been submitted for this account in the last 24 hours. Please check your email for the message with subject 'Temporary password reset' before requesting another reset." }, origin);
    }

    // if (!user) {
    //   return createResponse(404, { message: "No account found with the provided email. Please contact: gregtorrington@icloud.com." }, origin)
    // }

    const temporaryPassword = generateCognitoPassword();
    
    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: process.env.USER_POOL_ID as string,
      Username: body.username,
      Password: temporaryPassword,
      Permanent: false
    }));

    await sendTemporaryPasswordResetEmail(body.username, temporaryPassword);

    await addItem(
        process.env.EMAIL_RATE_LIMITER_TABLE_NAME as string,
        {
            user_id: body.username,
            feature: "RESET_TEMPORARY_PASSWORD",
            timestamp: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + 86400
        }       
    )

    return createResponse(200, { message: `A temporary password has been sent to your email, ${body.username}. Please check your inbox for the message with subject 'Temporary password reset'.` }, origin);

  } catch (error: any) {
    console.error('Sign-in error: ', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
