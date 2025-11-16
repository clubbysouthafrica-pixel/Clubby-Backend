import { AdminCreateUserCommand, AdminGetUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
    validateBillingField
} from "./function_helpers";

export type InputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

interface StandardField {
    field_type: "STANDARD";
    field_id: string;
    field_name: string;
    required: boolean;
    input_type: InputTypes;
    options?: string[];
}

interface BillingField {
    field_type: "BILLING";
    field_id: string;
    field_name: string;
    currency: CurrencyType;
    required: boolean;
    input_type: InputTypes;
    billingOptions: Record<string, any>[];
    amount?: number;
}

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const sesClient = new SESClient({ region: process.env.REGION });
const s3_client = new S3Client({ region: process.env.REGION });

function generateShortReference(
    userId: string
): string {
    const now = new Date();
    const mmdd = now.toISOString().slice(5, 10).replace('-', '');

    const hash = createHash('sha1').update(userId).digest('hex').toUpperCase();
    const shortHash = hash.substring(0, 6);

    return `REF-${mmdd}-${shortHash}`;
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

function validateStandardFields(standardFields: StandardField[], submittedFields: { name: string; value: string; field_id: string }[]): string | null {
    const requiredFields = standardFields.filter(f => f.required);
    const field_ids = submittedFields.map(f => f.field_id);
    const allValid = requiredFields.every(req => {
        if (!field_ids.includes(req.field_id)) {
            return false;
        }
        return true;
    });

    if (!allValid) {
        const missingField = requiredFields.find(req => !field_ids.includes(req.field_id));
        return `The following required field is missing. Field ID: ${missingField?.field_id}.`;
    }

    const known_field_ids = standardFields.map(f => f.field_id);
    for (const field of submittedFields) {
        if (!known_field_ids.includes(field.field_id)) {
            return `The following provided field does not exist in this club's registration form. Field ID: ${field.field_id}.`;
        }
    }

    return null;
}

async function registrationSubmitted(club_account_id: string, user_id: string): Promise<boolean> {
    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            user_id: user_id
        }
    )

    if (club_member == null) {
        return false;
    } else if (club_member.resubmission_required) {
        return false;
    }

    return true;
}

async function addSignature(
    club_account_id: string,
    club_season_cycle: number,
    signature_id: string,
    dataUrl: string,
): Promise<string> {
    const base64Data = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    const mimeMatch = dataUrl.match(/^data:(.+);base64,/);
    const contentType = mimeMatch ? mimeMatch[1] : "application/octet-stream";

    const key = `${club_account_id}/${club_season_cycle}/${signature_id}.png`;
    const command = new PutObjectCommand({
        Bucket: process.env.SIGNATURES_BUCKET_NAME,
        Body: buffer,
        Key: key,
        ContentEncoding: "base64",
        ContentType: contentType,
    });
    console.log(`@@@ putObject request (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}): `, JSON.stringify(command));
    const response = await s3_client.send(command);
    console.log(`@@@ putObject response (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}): `, JSON.stringify(response));

    return key
}

async function addToRegistrationsTable(
    club_account_id: string,
    user_id: string,
    billing_fields: any,
    standard_fields: any,
    membership_amount: number,
    registration_submitted_on: number
): Promise<string> {
    const member_registrations = await queryItems(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        "user_id = :userId",
        { ":userId": user_id }
    )

    let new_registration_index = 1
    if (member_registrations !== null) {

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
            ...billing_fields,
            ...standard_fields,
        }
    )

    return `${club_account_id}-00${new_registration_index}`;
}

async function addToClubReportingTable(
    club_account_id: string,
    membership_amount: number,
) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    await updateItem(
        process.env.CLUB_REPORTING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: `${year}/${month}`
        },
        `SET 
                #total_pending_members = if_not_exists(#total_pending_members, :zero) + :one,
                #total_pending_revenue = if_not_exists(#total_pending_revenue, :zero) + :member_registration_fee,
                #total_registration_pending_revenue = if_not_exists(#total_registration_pending_revenue, :zero) + :member_registration_fee
        `,
        {
            "#total_pending_members": "total_pending_members",
            "#total_registration_pending_revenue": "total_registration_pending_revenue",
            "#total_pending_revenue": "total_pending_revenue"
        },
        {
            ":one": 1,
            ":zero": 0,
            ":member_registration_fee": membership_amount,
        }
    )
}

async function addToTransactionsTable(
    club_account_id: string,
    first_name: string,
    surname: string,
    transaction_id: string,
    user_id: string,
    membership_amount: number
) {
    await addItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            name: `${first_name} ${surname}`,
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
    const emailBody = `
    <html>
    <body style="font-family: Arial, sans-serif; color: #333;">
      <p>Hi ${firstName},</p>
      <p>
        A registration for <strong>${clubName}</strong> has been submitted on your behalf. As a result, an account has been created for you on <strong>Clubby</strong>, giving you access to your affiliated club.
      </p>
      <p>Here are your login details:</p>
      <ul>
        <li><strong>Email:</strong> ${toAddress}</li>
        <li><strong>Temporary Password:</strong> ${tempPassword}</li>
      </ul>
      <p>
        When you first log in, you'll be prompted to set a new password.
      </p>
      <p>
        You can log in using the following link:<br/>
        <a href="https://${process.env.DOMAIN as string}/login">Log in to Clubby</a>
      </p>
      <p>
        To successfully register with ${clubName}, please complete the membership payment (This can be found in your member account under Payments & Billing).<br/>
      </p>
      <p>Welcome to Clubby!<br/>— The Clubby Team</p>
    </body>
  </html>
  
    `;

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

async function getClubEmailSendingLimit(club: any, club_account_id: string, emails: string[]): Promise<string | Record<string, string | number>> {
    if (!club) {
        return "Club does not exist."
    }

    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthly_bill = await getItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month
        }
    )

    const emails_sent = monthly_bill?.total_emails ?? 0;

    if (emails_sent + emails.length > club.maximum_monthly_emails) {
        return `Monthly email limit reached. Could not send registration email. Available emails: ${club?.maximum_monthly_emails - emails_sent}.`
    }

    return {
        support_email: club.support_email,
        email_source: club.club_from_email,
        free_email_limit: club.free_email_limit,
        email_fee: club.fee_per_email_to_club,
        emails_sent: emails_sent
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

        if (await registrationSubmitted(body.club_account_id, member_user_id as string)) {
            return createResponse(500, { message: "A member with this email is already associated with the club or was in the past." }, origin);
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

        const billing_fields = body.billing_fields.reduce((acc: Record<string, Record<string, string | number | undefined>>, field: {
            value: string; field_id: string; option_order_id?: string; label?: string; multiplier_value?: number
        }) => {
            const f = form.find(f => f.field_id === field.field_id);

            acc[`reg_field_${field.field_id}`] = { value: field.value, field_name: f?.field_name, multiplier_value: field?.multiplier_value };
            if (f?.input_type === "DROPDOWN" && field?.label) {
                acc[`reg_field_${field.field_id}`].label_value = field.label
                acc[`reg_field_${field.field_id}`].type = "BILLING_DROPDOWN"

                if (field?.option_order_id) {
                    acc[`reg_field_${field.field_id}`].option_order_id = field?.option_order_id
                }
            } else {
                acc[`reg_field_${field.field_id}`].type = "BILLING_TEXT"
            }
            return acc;
        }, {})

        const standard_fields: Record<string, Record<string, string>> = {};
        for (const field of body.standard_fields) {
            const f = form.find(f => f.field_id === field.field_id);

            standard_fields[`reg_field_${field.field_id}`] = { value: field.value, field_name: f?.field_name, type: "STANDARD_TEXT" };
            if (f?.input_type === "DROPDOWN") {
                standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_DROPDOWN"
            } else if (f?.input_type === "CHECKBOX") {
                standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_CHECKBOX"
            } else if (f?.input_type === "NUMBER") {
                standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_NUMBER"
            } else if (f?.input_type === "SIGNATURE") {

                standard_fields[`reg_field_${field.field_id}`].type = "STANDARD_SIGNATURE"
                if (field?.signature_type) {

                    standard_fields[`reg_field_${field.field_id}`].signature_type = field.signature_type

                    if (field.signature_type === "signature") {
                        const signature_id = randomUUID()
                        const key = await addSignature(
                            body.club_account_id,
                            club.season_cycle,
                            signature_id,
                            field.value
                        )
                        standard_fields[`reg_field_${field.field_id}`].value = key
                    }
                }
            }
        }

        const registration_submitted_on = Date.now()

        const current_reg_id = await addToRegistrationsTable(
            body.club_account_id,
            member_user_id,
            billing_fields,
            standard_fields,
            membership_amount,
            registration_submitted_on
        )

        const current_reg_transaction_id = randomUUID();

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
            registration_payment_reference: generateShortReference(member_user_id as string),
            currency: club.currency,
            club_name: club.club_name,
            season_cycle: club.season_cycle
        };

        await addItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            item
        );

        await addToClubReportingTable(body.club_account_id, membership_amount)
        await addToTransactionsTable(
            body.club_account_id,
            body.first_name,
            body.surname,
            current_reg_transaction_id,
            member_user_id as string,
            membership_amount,
        )

        if (club?.use_submission_email_template) {

            const club_sending_limit = await getClubEmailSendingLimit(club, body.club_account_id, [body.member_email]);
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
                    subject: `Registration Submission for ${club.club_name}`,
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
