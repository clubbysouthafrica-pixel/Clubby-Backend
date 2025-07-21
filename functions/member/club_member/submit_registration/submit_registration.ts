import {
    createResponse,
    deconstructEvent,
    addItem,
    queryItems,
    getItem
} from "./function_helpers";

export type InputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

interface StandardField {
    field_type: "STANDARD";
    field_name: string;
    required: boolean;
    input_type: InputTypes;
    options?: string[];
}

interface BillingField {
    field_type: "BILLING";
    field_name: string;
    currency: CurrencyType;
    required: boolean;
    input_type: InputTypes;
    billingOptions: Record<string, any>[];
    amount?: number;
}

function validateRequestBody(body: any) {
    if (!body?.club_account_id || !body?.billing_fields || !body?.standard_fields) {
        return 'club_account_id, billing_fields and standard_fields required.';
    }

    if (!Array.isArray(body.standard_fields) || body.standard_fields.length === 0) {
        return 'standard_fields is required to be an array containing objects.';
    }

    if (!Array.isArray(body.billing_fields) || body.billing_fields.length === 0) {
        return 'billing_fields is required to be an array containing objects.';
    }

    for (const field of body.billing_fields) {
        if (typeof field !== 'object') return 'All billing_fields indexes must be objects.';
        if (!field.name || !field.value || typeof field.name !== 'string') {
            return 'All billing_fields must have STRING keys: name and value.';
        }
    }

    for (const field of body.standard_fields) {
        if (typeof field !== 'object') return 'All standard_field indexes must be objects.';
        if (!field.name || !field.value || typeof field.name !== 'string' || typeof field.value !== 'string') {
            return 'All standard_fields must have STRING keys: name and value.';
        }
    }

    return null;
}

function validateBillingField(billingFields: BillingField[], submittedFields: { name: string; value: string }[]): number | null | string {
    const requiredFields = billingFields.filter(f => f.required);
    const fieldNames = submittedFields.map(f => f.name);
    const allValid = requiredFields.every(req => {
        if (!fieldNames.includes(req.field_name)) {
            return false;
        }
        return true;
    });

    if (!allValid) {
        const missingField = requiredFields.find(req => !fieldNames.includes(req.field_name));
        return `The following required field is missing: ${missingField?.field_name}.`;
    }

    const knownFieldNames = billingFields.map(f => f.field_name);
    for (const field of submittedFields) {
        if (!knownFieldNames.includes(field.name)) {
            return `The following provided field does not exist in this club's registration form: ${field.name}.`;
        }
    }

    let total_amount = 0;
    submittedFields.forEach(sub_field => {
        billingFields.forEach(billing_field => {
            if (billing_field.input_type === "TEXT" && billing_field.field_name === sub_field.name) {
                total_amount += billing_field.amount ?? 0;
            } else if (billing_field.input_type === "DROPDOWN" && billing_field.field_name === sub_field.name) {
                billing_field.billingOptions.forEach(billing_options_field => {
                    if (billing_options_field.label === sub_field.value) {
                        total_amount += billing_options_field.amount;
                    }
                })
            }
        })
    })

    return total_amount;
}

function validateStandardFields(standardFields: StandardField[], submittedFields: { name: string; value: string }[]): string | null {
    const requiredFields = standardFields.filter(f => f.required);
    const fieldNames = submittedFields.map(f => f.name);
    const allValid = requiredFields.every(req => {
        if (!fieldNames.includes(req.field_name)) {
            return false;
        }
        return true;
    });

    if (!allValid) {
        const missingField = requiredFields.find(req => !fieldNames.includes(req.field_name));
        return `The following required field is missing: ${missingField?.field_name}.`;
    }

    const knownFieldNames = standardFields.map(f => f.field_name);
    for (const field of submittedFields) {
        if (!knownFieldNames.includes(field.name)) {
            return `The following provided field does not exist in this club's registration form: ${field.name}.`;
        }
    }

    return null;
}

async function getClubName(club_account_id: string): Promise<string | null> {
    const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
        club_account_id: club_account_id
    });

    if (club == null) {
        return null
    }

    return club.club_name as string;
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
    }

    return true;
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const validationMessage = validateRequestBody(body);

        if (validationMessage) {
            return createResponse(400, { message: validationMessage }, origin);
        }

        if (await registrationSubmitted(body.club_account_id, user_id as string)) {
            return createResponse(400, { message: `Registration already submitted for this user in club: ${body.club_account_id}.` }, origin);
        }

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": body.club_account_id }
        )

        if (form == null) {
            return createResponse(400, { message: `Registration form does not exist for club: ${body.club_account_id}.` }, origin);
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
            if (field.field_type === 'BILLING') billingFields.push(field as BillingField);
            else standardFields.push(field as StandardField);
        });

        const membership_amount = validateBillingField(billingFields, body.billing_fields);
        if (typeof membership_amount === 'string') {
            return createResponse(400, { message: membership_amount }, origin);
        }

        const standardFieldValidation = validateStandardFields(standardFields, body.standard_fields);
        if (standardFieldValidation) {
            return createResponse(400, { message: standardFieldValidation }, origin);
        }

        const item = {
            club_account_id: body.club_account_id,
            user_id: user_id,
            member_email: user.email,
            member_first_name: user.first_name,
            member_surname: user.surname,
            registered: false,
            registration_submitted_on: new Date().toISOString(),
            club_name: await getClubName(body.club_account_id),
            outstanding_amount: membership_amount,
            primary_member: user_id,
            ...body.standard_fields.reduce((acc: Record<string, string>, field: { name: string; value: string }) => {
                acc[field.name] = field.value;
                return acc;
            }, {}),
            ...body.billing_fields.reduce((acc: Record<string, string>, field: { name: string; value: string }) => {
                acc[field.name] = field.value;
                return acc;
            }, {})
        };

        await addItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            item
        )

        return createResponse(200, { message: "Success" }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
