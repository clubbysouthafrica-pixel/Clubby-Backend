import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID, createHash } from "crypto";
import {
    createResponse,
    deconstructEvent,
    addItem,
    queryItems,
    getItem,
    updateItem,
    removeItem
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
        if (!field.field_id || field.value === undefined || field.value == null || typeof field.field_id !== 'string') {
            return 'All standard_fields must have STRING keys: field_id and value.';
        }
    }

    return null;
}

function validateBillingField(billingFields: BillingField[], submittedFields: { name: string; value: string; field_id: string; option_order_id?: string; multiplier_value?: number }[]): number | null | string {
    const requiredFields = billingFields.filter(f => f.required);
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

    const known_field_ids = billingFields.map(f => f.field_id);
    for (const field of submittedFields) {
        if (!known_field_ids.includes(field.field_id)) {
            return `The following provided field does not exist in this club's registration form. Field ID: ${field.field_id}.`;
        }
    }

    let total_amount = 0;
    submittedFields.forEach(sub_field => {
        billingFields.forEach(billing_field => {
            if (billing_field.input_type === "TEXT" && billing_field.field_id === sub_field.field_id) {

                if (sub_field?.multiplier_value) {
                    total_amount += (billing_field.amount ?? 0)*sub_field.multiplier_value;
                } else {
                    total_amount += billing_field.amount ?? 0;
                }

            } else if (billing_field.input_type === "DROPDOWN" && billing_field.field_id === sub_field.field_id) {
                billing_field.billingOptions.forEach(billing_options_field => {
                    if (billing_options_field.option_order_id === sub_field?.option_order_id) {
     
                        if (sub_field?.multiplier_value) {
                            total_amount += billing_options_field.amount*sub_field.multiplier_value;
                        } else {
                            total_amount += billing_options_field.amount;
                        }
                        
                    }
                })
            }
        })
    })

    return total_amount;
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

async function getClubDetails(club_account_id: string): Promise<{club_name: string, currency: string, season_cycle: number} | null> {
    const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
        club_account_id: club_account_id
    });

    if (club == null) {
        return null
    }

    return { club_name: club.club_name, currency: club.currency, season_cycle: club.season_cycle };
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
            payment_type: "EFT/CASH",
            status: "PENDING"
        }
    )
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

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const validationMessage = validateRequestBody(body);

        if (validationMessage) {
            return createResponse(400, { message: validationMessage }, origin);
        }

        if (await registrationSubmitted(body.club_account_id, user_id as string)) {
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

        const clubDetails = await getClubDetails(body.club_account_id);
        if (!clubDetails) {
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
                            clubDetails.season_cycle,
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
            user_id as string,
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
            user_id: user_id,
            current_reg_transaction_id,
            member_email: user.email,
            member_first_name: user.first_name,
            member_surname: user.surname,
            registered: false,
            registration_payment_reference: generateShortReference(user_id as string),
            ...clubDetails,
        };

        await addItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            item
        );

        await addToClubReportingTable(body.club_account_id, membership_amount)
        await addToTransactionsTable(
            body.club_account_id,
            user.first_name,
            user.surname,
            current_reg_transaction_id,
            user_id as string,
            membership_amount,
        )

        return createResponse(200, { message: "Registration form successfully submitted." }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
