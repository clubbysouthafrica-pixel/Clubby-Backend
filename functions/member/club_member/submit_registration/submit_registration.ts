import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { randomUUID } from "crypto";
import {
    createResponse,
    deconstructEvent,
    addItem,
    queryItems,
    getItem,
    updateItem,
    removeItem,
    sendSqsMessage,
    validateBillingField,
    validateStandardFields,
    StandardField,
    BillingField,
    billingFieldMapping,
    standardFieldMapping,
    getClubEmailSendingLimit,
    sendMemberVerificationQrEmail
} from "./function_helpers";

const sesClient = new SESClient({ region: process.env.REGION });

export type InputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO' | 'IMAGE';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

function validateRequestBody(body: any) {
    if (!body?.club_account_id || !body?.billing_fields || !body?.standard_fields) {
        return 'club_account_id, billing_fields and standard_fields required.';
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
        if (!field.field_id || typeof field.field_id !== 'string') {
            return 'All standard_fields must have a STRING field_id.';
        }
        const hasValue = field.value !== undefined && field.value !== null;
        const hasImages = Array.isArray(field.images);
        if (!hasValue && !hasImages) {
            return 'All standard_fields must have a value (or an images array for image fields).';
        }
    }

    return null;
}

async function registrationSubmitted(club_account_id: string, user_id: string): Promise<{ submitted: boolean; shop_user?: boolean; exists: boolean; ttl?: number }> {
    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            user_id: user_id
        }
    )

    const exists = club_member != null;

    if (club_member == null) {
        return { submitted: false, exists };
    } else if (club_member.resubmission_required) {
        return { submitted: false, exists, ttl: club_member?.ttl };
    } else if (club_member?.non_registration === true) {
        return { submitted: false, shop_user: club_member?.shop_user, exists, ttl: club_member?.ttl };
    }

    return { submitted: true, exists, ttl: club_member?.ttl };
}

async function addToRegistrationsTable(
    club_account_id: string,
    user_id: string,
    billing_fields: any,
    standard_fields: any,
    membership_amount: number,
    registration_submitted_on: number,
    transaction_id?: string,
    ttl?: number,
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
            ...(ttl !== undefined ? { ttl } : {}),
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
    ttl?: number,
) {
    await addItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            name: `${first_name} ${surname}`,
            transaction_id: transaction_id,
            registration_id: registration_id,
            user_id: user_id as string,
            amount_paid: 0,
            club_income: true,
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
            status: "PENDING",
            ...(ttl !== undefined ? { ttl } : {}),
        }
    )
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

        const { submitted, shop_user, exists: clubMemberExists, ttl: existingTtl } = await registrationSubmitted(body.club_account_id, user_id as string);
        if (submitted) {
            return createResponse(400, { message: "Registration form has already been submitted." }, origin);
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
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        const user = await getItem(
            process.env.USERS_TABLE_NAME as string,
            {
                user_type: "MEMBER",
                user_id: user_id as string,
            }
        );

        if (!user) {
            return createResponse(400, { message: `User ${user_id} does not exist.` }, origin);
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

        const membership_amount = validateBillingField(billingFields, body.billing_fields, club.time_zone);
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

        const billing_fields = billingFieldMapping(body.billing_fields, form, club.time_zone);

        const standard_fields = await standardFieldMapping(
            body.standard_fields,
            form,
            body.club_account_id
        );

        const registration_submitted_on = Date.now()

        const current_reg_transaction_id = randomUUID();

        const ttl = club.eft_enabled === false && !shop_user
            ? Math.floor(Date.now() / 1000) + 3600
            : undefined;

        const shouldSetTtl = ttl !== undefined && (!clubMemberExists || existingTtl !== undefined);

        const current_reg_id = await addToRegistrationsTable(
            body.club_account_id,
            user_id as string,
            billing_fields,
            standard_fields,
            membership_amount,
            registration_submitted_on,
            membership_amount > 0 ? current_reg_transaction_id : undefined,
            ttl,
        )

        const item = {
            club_account_id: body.club_account_id,
            resubmission_required: false,
            email_opt_in: body?.email_opt_in ?? false,
            current_reg_id,
            user_id: user_id,
            current_reg_transaction_id: membership_amount > 0 ? current_reg_transaction_id : undefined,
            member_email: user.email,
            member_first_name: user.first_name,
            member_surname: user.surname,
            registered: false,
            registration_payment_reference: `${user.first_name} ${user.surname}`,
            currency: club.currency,
            club_name: club.club_name,
            season_cycle: club.season_cycle,
            shop_user,
            ...(shouldSetTtl ? { ttl } : { registration_user: true }),
        };

        if (membership_amount > 0) {
            await addToTransactionsTable(
                body.club_account_id,
                user.first_name,
                user.surname,
                current_reg_transaction_id,
                user_id as string,
                membership_amount,
                current_reg_id,
                ttl,
            )
        }

        await addItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            item
        );

        if (club.eft_enabled !== false) {
            try {
                const registration_configuration = await getItem(
                    process.env.REGISTRATION_CONFIGURATION_TABLE_NAME as string,
                    { club_account_id: body.club_account_id }
                );

                if (registration_configuration?.send_qr_code_email_on_registration === true) {
                    await sendMemberVerificationQrEmail(
                        user.email,
                        user.first_name,
                        club.club_name,
                        body.club_account_id,
                        user_id as string
                    );
                }
            } catch (error) {
                console.error("Error sending member verification QR code email:", error);
            }
        }

        if (club.notify_on_member_registration !== false) {
            await sendEmailToAdmin(
                club.support_email,
                user.first_name,
                user.surname,
                club.club_name
            )
        }

        if (club.use_submission_email_template) {
            const club_sending_limit = await getClubEmailSendingLimit(body.club_account_id, [user.email]);
            if (typeof club_sending_limit === 'string') {
                return createResponse(200, { message: "Registration form successfully submitted. A registration email is supposed to be sent however the club has reached its monthly limit." }, origin);
            } else {

                let finalBody = club.registration_submission_email_template_body
                    .replace(/{{member_name}}/g, `${user.first_name} ${user.surname}`)
                    .replace(/{{club_name}}/g, club.club_name)
                    .replace(/{{club_email}}/g, club.support_email);

                await sendSqsMessage(
                    process.env.SEND_EMAIL_QUEUE_URL as string,
                    {
                        emails: [user.email],
                        subject: club.registration_submission_email_subject,
                        email_body: finalBody,
                        club_account_id: body.club_account_id,
                        ...club_sending_limit
                    },
                    "ChargeableEmails"
                );
            }
        }

        return createResponse(
            200, 
            { 
                message: "Registration form successfully submitted.",
                transaction_id: current_reg_transaction_id, 
                user_id: user_id as string,
                amount: membership_amount 
            }, 
            origin
        );

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
