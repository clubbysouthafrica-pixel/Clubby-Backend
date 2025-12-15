import {
    createResponse,
    deconstructEvent,
    updateItem
} from "./function_helpers";

type FieldType = 'STANDARD_DROPDOWN' | 'STANDARD_NUMBER' | 'STANDARD_CHECKBOX' | 'STANDARD_TEXT';

interface UpdateRegistrationFieldBody {
    registration_id: string;
    user_id: string;
    field_id: string;
    field_name: string;
    type: FieldType;
    value: string;
}

function validateBody(body: UpdateRegistrationFieldBody): string | null {
    if (!body.registration_id) return "registration_id is required";
    if (!body.field_id) return "field_id is required";
    if (!body.field_name) return "field_name is required";
    if (!body.type) return "type is required";
    if (!['STANDARD_DROPDOWN', 'STANDARD_NUMBER', 'STANDARD_CHECKBOX', 'STANDARD_TEXT'].includes(body.type)) {
        return "type must be one of: STANDARD_DROPDOWN, STANDARD_NUMBER, STANDARD_CHECKBOX, STANDARD_TEXT";
    }
    if (body.value === undefined || body.value === null) return "value is required";
    if (typeof body.value !== 'string') return "value must be a string";

    return null;
}

export const handler = async (event: any) => {
    const { origin, body, user_id } = deconstructEvent(event);

    try {
        const validationError = validateBody(body);
        if (validationError) {
            return createResponse(400, { message: validationError }, origin);
        }
        const fieldData = {
            field_name: String(body.field_name),
            type: String(body.type),
            value: String(body.value)
        };

        await updateItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                registration_id: body.registration_id,
                user_id: user_id as string
            },
            `SET #field = :field_data`,
            { "#field": `reg_field_${body.field_id}` },
            { ":field_data": fieldData }
        );

        return createResponse(200, { 
            message: "Registration field updated successfully",
            field_name: body.field_name,
            type: body.type,
            value: body.value
        }, origin);

    } catch (error: any) {
        console.error("Error updating registration field:", error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
