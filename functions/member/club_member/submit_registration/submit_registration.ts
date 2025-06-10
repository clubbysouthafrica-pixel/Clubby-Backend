import { 
    createResponse, 
    deconstructEvent, 
    addItem, 
    queryItems, 
    getItem 
} from "./function_helpers";

export type InputType = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'DOLLAR' | 'RAND' | 'EURO' | 'POUND' | 'NEW ZEALAND DOLLAR' | 'AUSTRALIAN DOLLAR';

interface StandardField {
    field_type: "STANDARD";
    field_name: string;
    required: boolean;
    type: InputType;
    options?: string[];
}

interface BillingField {
    field_type: "BILLING";
    field_name: string;
    currency: CurrencyType;
    amount: number;
}

function validateRequestBody(body: any) {
    if (!body?.club_account_id || !body?.billing_field || !body?.standard_fields) {
        return 'club_account_id, billing_field and standard_fields required.';
    }

    if (typeof body.billing_field !== 'object') {
        return 'billing_field is required to be an object.';
    }

    if (!Array.isArray(body.standard_fields) || body.standard_fields.length === 0) {
        return 'standard_fields is required to be an array containing objects.';
    }

    const { billing_type, amount } = body.billing_field;
    if (!billing_type || amount == null) {
        return 'billing_type and amount is required in each billing_field object.';
    }

    if (typeof billing_type !== 'string' || typeof amount !== 'number') {
        return 'Each billing_field object requires billing_type to be STRING and amount to be NUMBER.';
    }

    for (const field of body.standard_fields) {
        if (typeof field !== 'object') return 'All standard_field indexes must be objects.';
        if (!field.name || !field.value || typeof field.name !== 'string' || typeof field.value !== 'string') {
            return 'All standard_fields must have STRING keys: name and value.';
        }
    }

    return null;
}

function validateBillingField(billingFields: BillingField[], userBillingField: { billing_type: string, amount: number }): boolean {
    return billingFields.some(
        (field) =>
            field.field_name === userBillingField.billing_type &&
            field.amount === userBillingField.amount
    );
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

async function memberNotExists(user_id: string): Promise<boolean> {
    const member = await getItem(
        process.env.USERS_TABLE_NAME as string,
        {
            user_type: "MEMBER",
            user_id: user_id
        }
    )

    if (member == null) {
        return true;
    }

    return false;
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
            return createResponse(400, { message: `Registration already submitted for user ${user_id} in club: ${body.club_account_id}.` }, origin);
        }

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": body.club_account_id }
        )

        if (form == null) {
            return createResponse(400, { message: `Registration form does not exist for club: ${body.club_account_id}.` }, origin);
        }

        const billingFields: BillingField[] = [];
        const standardFields: StandardField[] = [];

        form.forEach(field => {
            if (field.field_type === 'BILLING') billingFields.push(field as BillingField);
            else standardFields.push(field as StandardField);
        });

        if (!validateBillingField(billingFields, body.billing_field)) {
            return createResponse(400, {
                message: `Invalid billing field entered. Valid billing types: ${JSON.stringify(billingFields.reduce((acc: Record<string, number>, field: { field_name: string; amount: number }) => {
                    acc[field.field_name] = field.amount;
                    return acc;
                }, {}))}`
            }, origin);
        }

        const standardFieldValidation = validateStandardFields(standardFields, body.standard_fields);
        if (standardFieldValidation) {
            return createResponse(400, { message: standardFieldValidation }, origin);
        }

        const item = {
            club_account_id: body.club_account_id,
            user_id: user_id,
            registered: false,
            outstanding_amount: body.billing_field.amount,
            primary_member: user_id,
            billing_type: body.billing_field.billing_type,
            ...body.standard_fields.reduce((acc: Record<string, string>, field: { name: string; value: string }) => {
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
