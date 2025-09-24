import { randomUUID } from "crypto";
import {
    createResponse,
    deconstructEvent,
    addItem,
    queryItems,
    getItem
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

function generateShortReference(
    firstName: string,
    lastName: string,
): string {
    const initials = `${firstName[0]}${lastName[0]}`.toUpperCase();

    const now = new Date();
    const mmdd = now.toISOString().slice(5, 10).replace('-', ''); // e.g., "0721"

    let shortCode = '00';

    return `${initials}-${mmdd}-${shortCode}`;
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

function validateBillingField(billingFields: BillingField[], submittedFields: { name: string; value: string; field_id: string; option_order_id?: string }[]): number | null | string {
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
                total_amount += billing_field.amount ?? 0;
            } else if (billing_field.input_type === "DROPDOWN" && billing_field.field_id === sub_field.field_id) {
                billing_field.billingOptions.forEach(billing_options_field => {
                    if (billing_options_field.option_order_id === sub_field?.option_order_id) {
                        total_amount += billing_options_field.amount;
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

async function getClubDetails(club_account_id: string): Promise<Record<string, string> | null> {
    const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
        club_account_id: club_account_id
    });

    if (club == null) {
        return null
    }

    return { club_name: club.club_name, currency: club.currency };
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

async function addToRegistrationFeesTable(
    club_account_id: string, 
    user_id: string, 
    billing_fields: any, 
    membership_amount: number, 
    registration_submitted_on: number
): Promise<string> {
    const member_registrations = await queryItems(
        process.env.REGISTRATION_FEES_TABLE_NAME as string,
        "user_id = :userId",
        { ":userId": user_id }
    )

    let new_registration_index = 1
    if (member_registrations !== null) {
        new_registration_index = member_registrations.length + 1
    }

    await addItem(
        process.env.REGISTRATION_FEES_TABLE_NAME as string,
        {
            user_id: user_id,
            registration_id: `${club_account_id}-00${new_registration_index}`,
            club_account_id,
            total_fee: membership_amount,
            total_outstanding_amount: membership_amount,
            deregistered: false,
            registration_submitted_on,
            ...billing_fields,
        }
    )

    return `${club_account_id}-00${new_registration_index}`;
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

        const billing_fields = body.billing_fields.reduce((acc: Record<string, Record<string, string>>, field: {
            value: string; field_id: string; option_order_id?: string; label?: string;
        }) => {
            const f = form.find(f => f.field_id === field.field_id);

            acc[`reg_field_${field.field_id}`] = { value: field.value, field_name: f?.field_name };
            if (f?.input_type === "DROPDOWN" && field?.label) {
                acc[`reg_field_${field.field_id}`].label_value = field.label
                acc[`reg_field_${field.field_id}`].type = "BILLING_DROPDOWN"
            } else {
                acc[`reg_field_${field.field_id}`].type = "BILLING_TEXT"
            }
            return acc;
        }, {})

        const registration_submitted_on = Date.now()

        const current_reg_id = await addToRegistrationFeesTable(body.club_account_id, user_id as string, billing_fields, membership_amount, registration_submitted_on)

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
            registration_payment_reference: generateShortReference(user.first_name, user.surname),
            registration_submitted_on,
            ...await getClubDetails(body.club_account_id),
            primary_member: user_id,
            ...body.standard_fields.reduce((acc: Record<string, Record<string, string>>, field: { value: string; field_id: string }) => {
                const f = form.find(f => f.field_id === field.field_id);

                acc[`reg_field_${field.field_id}`] = { value: field.value, field_name: f?.field_name, type: "STANDARD_TEXT" };
                if (f?.input_type === "DROPDOWN") {
                    acc[`reg_field_${field.field_id}`].type = "STANDARD_DROPDOWN"
                } else if (f?.input_type === "CHECKBOX") {
                    acc[`reg_field_${field.field_id}`].type = "STANDARD_CHECKBOX"
                } else if (f?.input_type === "NUMBER") {
                    acc[`reg_field_${field.field_id}`].type = "STANDARD_NUMBER"
                }
                return acc;
            }, {}),
            ...billing_fields
        };

        await addItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            item
        );

        await addItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id,
                name: `${user.first_name} ${user.surname}`,
                transaction_id: current_reg_transaction_id,
                user_id: user_id as string,
                amount_paid: 0,
                amount: membership_amount,
                [`lifecycle_${Date.now}`]: {
                    date: Date.now(),
                    description: "Registration submission",
                    amount: membership_amount
                },
                type: "REGISTRATION",
                payment_type: "EFT/CASH",
                status: "PENDING"
            }
        )

        return createResponse(200, { message: "Registration form successfully submitted." }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
