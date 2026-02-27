import {
  AdminConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  SignUpCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { createResponse, deconstructEvent, addItem } from "./function_helpers";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const sesClient = new SESClient({ region: process.env.REGION });

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

export async function sendAccountCreatedEmail(
  toAddress: string,
  tempPassword: string,
): Promise<void> {
  const emailSubject = "Your Clubby Admin Account Has Been Created";
  const loginUrl = `https://${process.env.DOMAIN as string}/login?email=${encodeURIComponent(toAddress)}&tempPassword=${encodeURIComponent(tempPassword)}&login=admin`;
  
  const emailBody = `
    <html>
      <body style="margin:0;padding:0;background:#f7f7f9;font-family: Arial, Helvetica, sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 0 24px;">
                    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:28px;color:#111827;">Welcome to Clubby, Administrator!</h1>
                    <p style="margin:0 0 16px 0;line-height:1.6;">Your administrator account has been created. Click the button below to sign in and start managing your club(s).</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 16px;font-weight:600;">Activate Admin Account</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <p style="margin:0 0 12px 0;line-height:1.6;color:#374151;"><strong>We recommend using the button above for the easiest login experience.</strong></p>
                    <p style="margin:0 0 12px 0;line-height:1.6;color:#374151;">If you prefer, you can also sign in manually with the temporary credentials below:</p>
                    <div style="background:#f3f4f6;border-left:4px solid #2563eb;padding:12px;border-radius:4px;margin:12px 0;">
                      <p style="margin:0 0 8px 0;line-height:1.6;color:#1f2937;"><strong>Username:</strong> ${toAddress}</p>
                      <p style="margin:0;line-height:1.6;color:#1f2937;"><strong>Temporary Password:</strong> ${tempPassword}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <p style="margin:0 0 8px 0;line-height:1.6;color:#374151;">Security tip: For your protection, keep your credentials confidential. If you did not expect this email, contact us immediately.</p>
                    <p style="margin:0;line-height:1.6;color:#374151;">Need help? Email us at <a href="mailto:admin@${process.env.DOMAIN as string}" style="color:#2563eb;text-decoration:none;">admin@${process.env.DOMAIN as string}</a>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;border-top:1px solid #e5e7eb;">
                    <p style="margin:12px 0 0 0;line-height:1.6;color:#6b7280;">Regards,<br/>The Clubby Team</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`;
  
  console.log('Email content prepared:', { toAddress, emailSubject, emailBody: emailBody });

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

export async function createClubbyUser(email: string): Promise<string> {
  const password = generateCognitoPassword();

  try {
    const createUserResponse = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email }
        ],
        MessageAction: 'SUPPRESS',
      })
    );

    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: email,
        Password: password,
        Permanent: false,
      })
    );

    const userSubAttr = createUserResponse.User?.Attributes?.find(attr => attr.Name === 'sub');
    const userSub = userSubAttr?.Value;

    if (!userSub) throw new Error('UserSub not found in response');

    await addItem(
      process.env.USERS_TABLE_NAME as string,
      {
        user_type: process.env.USER_TYPE as string,
        user_id: userSub,
        email,
        onboarded: false,
      }
    );

    await sendAccountCreatedEmail(email, password)

    return userSub;

  } catch (error: any) {
    if (error.name === 'UsernameExistsException') {
      console.warn(`⚠️ User with email ${email} already exists. Fetching user ID...`);

      const existingUser = await cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: process.env.USER_POOL_ID!,
          Username: email,
        })
      );

      const subAttr = existingUser.UserAttributes?.find(attr => attr.Name === 'sub');
      if (!subAttr || !subAttr.Value) {
        return "Issue registering user.";
      }

      console.log(`User ID successfully retrieved: ${subAttr.Value!}`)
      return subAttr.Value!;
    } else {
      return "Issue registering user.";
    }
  }
}

export const handler = async (event: any) => {

  const { origin, body, query_string_params } = deconstructEvent(event, false);

  try {

    if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
      return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
    }

    if (body?.username == null) {
      return createResponse(400, { message: 'Username required.' }, origin);
    }

    return createResponse(
      200,
      {
        message: "Admin creation successful!",
        user_id: await createClubbyUser(body.username),
      },
      origin
    );
  } catch (error: any) {
    console.error('Admin creation error:', error);
    const message = error?.message || "Internal Server Error";
    const statusCode = error?.$metadata?.httpStatusCode || 500;
    return createResponse(statusCode, { message }, origin);
  }
};
