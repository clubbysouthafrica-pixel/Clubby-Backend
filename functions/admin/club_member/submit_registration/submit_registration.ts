import { AdminCreateUserCommand, AdminGetUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { randomUUID, createHash } from "crypto";
import {
    createResponse,
    deconstructEvent,
    addItem,
    queryItems,
    getItem,
    updateItem,
    sendSqsMessage,
    removeItem,
    validateBillingField,
    validateStandardFields,
    billingFieldMapping,
    standardFieldMapping,
    StandardField,
    BillingField,
    getClubEmailSendingLimit
} from "./function_helpers";

export type InputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

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

function validateRequestBody(body: any) {
    if (
        !body?.club_account_id || !body?.billing_fields ||
        !body?.standard_fields || !body?.member_email ||
        !body?.first_name || !body.surname
    ) {
        return 'club_account_id, billing_fields, standard_fields, first_name, surname and member_email required.';
    }

    if (
        typeof body.member_email !== "string" || typeof body.first_name !== "string" ||
        typeof body.surname !== "string"
    ) {
        return 'member_email, first_name and surname must be of type string.'
    }

    if (body.standard_fields.length > 0 && !Array.isArray(body.standard_fields)) {
        return 'standard_fields is required to be an array containing objects.';
    }

    if (body.billing_fields.length > 0 && !Array.isArray(body.billing_fields)) {
        return 'billing_fields is required to be an array containing objects.';
    }

    for (const field of body.billing_fields) {
        if (typeof field !== 'object') return 'All billing_fields indexes must be objects.';
        if (!field.field_id || field.value === undefined || field.value == null || typeof field.field_id !== 'string') {
            return 'All billing_fields must have STRING keys: field_id and value.';
        }
    }

    for (const field of body.standard_fields) {
        if (typeof field !== 'object') return 'All standard_field indexes must be objects.';
        if (!field.field_id || field.value === undefined || field.value == null || typeof field.field_id !== 'string') {
            return 'All standard_fields must have STRING keys: field_id and value.';
        }
    }

    return null;
}

async function alreadyAssociated(club_account_id: string, user_id: string): Promise<boolean> {
    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            user_id: user_id
        }
    )

    if (club_member == null) {
        return false;
    }
    return true;
}

async function addToRegistrationsTable(
    club_account_id: string,
    user_id: string,
    billing_fields: any,
    standard_fields: any,
    membership_amount: number,
    registration_submitted_on: number,
    transaction_id: string,
): Promise<string> {
    const all_registrations = await queryItems(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        "user_id = :userId",
        { ":userId": user_id }
    )
    const member_registrations = all_registrations?.filter((reg: any) => reg.club_account_id === club_account_id) || null;

    let new_registration_index = 1
    if (member_registrations !== null && member_registrations.length > 0) {

        if (member_registrations.length == 1 && member_registrations[0]?.last_season_registration) {
            new_registration_index = 1

            await removeItem(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                {
                    user_id: member_registrations[0].user_id,
                    registration_id: member_registrations[0].registration_id
                }
            )

        } else {
            new_registration_index = member_registrations.length + 1

            await updateItem(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                {
                    user_id: user_id,
                    registration_id: member_registrations.find((reg: any) => reg.latest_registration)?.registration_id
                },
                "SET #latest_registration = :false",
                { "#latest_registration": "latest_registration" },
                { ":false": false }
            )
        }
    }

    await addItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: user_id,
            registration_id: `${club_account_id}-00${new_registration_index}`,
            club_account_id,
            total_fee: membership_amount,
            total_outstanding_amount: membership_amount,
            deregistered: false,
            registration_submitted_on,
            transaction_id,
            latest_registration: true,
            ...billing_fields,
            ...standard_fields,
        }
    )

    return `${club_account_id}-00${new_registration_index}`;
}

async function addToTransactionsTable(
    club_account_id: string,
    first_name: string,
    surname: string,
    transaction_id: string,
    user_id: string,
    membership_amount: number,
    registration_id: string,
) {
    await addItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            name: `${first_name} ${surname}`,
            registration_id: registration_id,
            club_income: true,
            transaction_id: transaction_id,
            user_id: user_id as string,
            amount_paid: 0,
            amount: membership_amount,
            creation_date: Date.now(),
            lifecycle: {
                [Date.now()]: {
                    description: "Registration submission",
                    amount: membership_amount,
                    type: "SUBMISSION"
                }
            },
            type: "REGISTRATION",
            status: "PENDING"
        }
    )
}

export async function sendAccountCreatedEmail(
    toAddress: string,
    firstName: string,
    tempPassword: string,
    clubName: string,
): Promise<void> {
    const emailSubject = "Your Clubby Account Has Been Created";
    const loginUrl = `https://${process.env.DOMAIN as string}/login?email=${encodeURIComponent(toAddress)}&tempPassword=${encodeURIComponent(tempPassword)}`;
    
    const emailBody = `
    <html>
      <body style="margin:0;padding:0;background:#f7f7f9;font-family: Arial, Helvetica, sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 0 24px;">
                    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:28px;color:#111827;">Welcome to Clubby, ${firstName}!</h1>
                    <p style="margin:0 0 16px 0;line-height:1.6;">A registration for <strong>${clubName}</strong> has been submitted on your behalf. As a result, an account has been created for you on Clubby, giving you access to your affiliated club.</p>
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
                      <p style="margin:0;line-height:1.6;color:#1f2937;"><strong>Temporary Password:</strong> ${tempPassword}</p>
                    </div>
                    <p style="margin:12px 0 0 0;line-height:1.6;color:#374151;">To successfully register with ${clubName}, please complete the membership payment. You can find this in your member account under Payments & Billing.</p>
                    <p style="margin:8px 0 8px 0;line-height:1.6;color:#374151;">Security tip: For your protection, please change your password after your first login and keep your credentials confidential.</p>
                    <p style="margin:0;line-height:1.6;color:#374151;">Need help? Email us at <a href="mailto:admin@${process.env.DOMAIN as string}" style="color:#2563eb;text-decoration:none;">admin@${process.env.DOMAIN as string}</a>.</p>
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

    console.log('Email subject:', emailSubject);
    console.log('Email body:', emailBody);

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

export async function createClubbyUser(email: string, first_name: string, surname: string, club_name: string): Promise<string> {
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
                first_name,
                surname,
                onboarded: false,
            }
        );

        await sendAccountCreatedEmail(
            email,
            first_name,
            password,
            club_name,
        )

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

export async function sendEmailToAdmin(
    toAddress: string,
    firstName: string,
    surname: string,
    clubName: string,
): Promise<void> {
    const emailSubject = `New Member Registration for ${clubName}`;
    const emailBody = `
    <html>
      <body style="margin:0;padding:0;background:#f7f7f9;font-family: Arial, Helvetica, sans-serif;color:#1f2937;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 24px 0 24px;">
                    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:28px;color:#111827;">New Member Registration</h1>
                    <p style="margin:0 0 16px 0;line-height:1.6;">A new member, <strong>${firstName} ${surname}</strong>, has submitted a registration form for your club, <strong>${clubName}</strong>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 0 24px;">
                    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:16px;">
                      <p style="margin:0 0 8px 0;font-weight:bold;color:#111827;">Member Details</p>
                      <p style="margin:0;line-height:1.6;"><strong>Name:</strong> ${firstName} ${surname}<br/>
                      <strong>Club:</strong> ${clubName}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 0 24px;">
                    <p style="margin:0 0 16px 0;line-height:1.6;">To review and complete their registration, please visit the Members Pending section.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <a href="https://${process.env.DOMAIN as string}/manage/members" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 16px;font-weight:600;">View Members Pending</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <p style="margin:0;line-height:1.6;color:#374151;">Need help? Email us at <a href="mailto:admin@${process.env.DOMAIN as string}" style="color:#2563eb;text-decoration:none;">admin@${process.env.DOMAIN as string}</a>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px 24px;border-top:1px solid #e5e7eb;">
                    <p style="margin:12px 0 0 0;line-height:1.6;color:#6b7280;">Kind regards,<br/>The Clubby Team</p>
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
        Source: `registrations@${process.env.DOMAIN as string}`,
    });

    try {
        await sesClient.send(command);
        console.log(`✅ Email sent to ${toAddress}`);
    } catch (err) {
        console.error("❌ Error sending email:", err);
        throw err;
    }
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const validationMessage = validateRequestBody(body);

        if (validationMessage) {
            return createResponse(400, { message: validationMessage }, origin);
        }

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": body.club_account_id }
        )
        if (form == null) {
            return createResponse(400, { message: "Registration form does not exist for the club." }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: body.club_account_id
        });
        if (!club) {
            return createResponse(500, { message: "Club does not exist." }, origin);
        }

        const member_user_id = await createClubbyUser(body.member_email, body.first_name, body.surname, club.club_name)
        if (member_user_id === "Issue registering user.") {
            return createResponse(500, { message: "Issue registering user" }, origin);
        }

        if (await alreadyAssociated(body.club_account_id, member_user_id as string)) {
            return createResponse(500, { message: `A member with email ${body.member_email} is already associated with the club or was in the past. Please login as a member with this email to continue registration.` }, origin);
        }

        const billingFields: BillingField[] = [];
        const standardFields: StandardField[] = [];

        form.forEach(field => {
            if (!field.visible) {
                return
            }

            if (field.field_type === 'BILLING') billingFields.push(field as BillingField);
            else standardFields.push(field as StandardField);
        });

        const membership_amount = validateBillingField(billingFields, body.billing_fields);
        if (typeof membership_amount === 'string') {
            return createResponse(400, { message: membership_amount }, origin);
        }
        if (typeof membership_amount !== "number") {
            return createResponse(500, { message: "Issue processing registration form." }, origin);
        }

        const standardFieldValidation = validateStandardFields(standardFields, body.standard_fields);
        if (standardFieldValidation) {
            return createResponse(400, { message: standardFieldValidation }, origin);
        }

        const billing_fields = billingFieldMapping(body.billing_fields, form);

        const standard_fields = await standardFieldMapping(
            body.standard_fields,
            form,
            body.club_account_id
        );

        const registration_submitted_on = Date.now()

        const current_reg_transaction_id = randomUUID();

        const current_reg_id = await addToRegistrationsTable(
            body.club_account_id,
            member_user_id,
            billing_fields,
            standard_fields,
            membership_amount,
            registration_submitted_on,
            current_reg_transaction_id
        )

        const item = {
            club_account_id: body.club_account_id,
            resubmission_required: false,
            current_reg_id,
            user_id: member_user_id,
            current_reg_transaction_id,
            member_email: body.member_email,
            member_first_name: body.first_name,
            member_surname: body.surname,
            registered: false,
            registration_payment_reference: `${body.first_name} ${body.surname}`,
            currency: club.currency,
            club_name: club.club_name,
            season_cycle: club.season_cycle
        };

        await addItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            item
        );

        await addToTransactionsTable(
            body.club_account_id,
            body.first_name,
            body.surname,
            current_reg_transaction_id,
            member_user_id as string,
            membership_amount,
            current_reg_id
        )

        if (club.notify_on_member_registration !== false) {
            await sendEmailToAdmin(
                club.support_email,
                body.first_name,
                body.surname,
                club.club_name
            )
        }

        if (club?.use_submission_email_template) {

            const club_sending_limit = await getClubEmailSendingLimit(body.club_account_id, [body.member_email], club);
            if (typeof club_sending_limit === 'string') {
                return createResponse(200, { message: club_sending_limit }, origin);
            }

            let finalBody = club.registration_submission_email_template_body
                .replace(/{{member_name}}/g, `${body.first_name} ${body.surname}`)
                .replace(/{{club_name}}/g, club.club_name)
                .replace(/{{club_email}}/g, club.support_email);

            await sendSqsMessage(
                process.env.SEND_EMAIL_QUEUE_URL as string,
                {
                    emails: [body.member_email],
                    subject: club.registration_submission_email_subject,
                    email_body: finalBody,
                    club_account_id: body.club_account_id,
                    ...club_sending_limit
                },
                "ChargeableEmails"
            );
        }

        return createResponse(200, { message: "Registration form successfully submitted." }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
