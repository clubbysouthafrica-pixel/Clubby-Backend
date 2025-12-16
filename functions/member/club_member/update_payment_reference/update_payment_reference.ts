import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

function validateBody(body: Record<string, any>): string | null {
    if (body?.club_account_id == null) {
        return "Invalid body. Required attributes: club_account_id."
    }
    if (typeof body.club_account_id !== 'string') {
        return "Invalid body. Required attribute types: club_account_id (string)."
    }

    if (body?.registration_payment_reference == null) {
        return "Invalid body. Required attributes: registration_payment_reference."
    }

    if (typeof body.registration_payment_reference !== 'string') {
        return "Invalid body. Required attribute types: registration_payment_reference (string)."
    }

    if (body.registration_payment_reference.trim() === '') {
        return "Invalid body. registration_payment_reference cannot be empty."
    }

    return null
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const invalid_body_message = validateBody(body);
        if (invalid_body_message) {
            return createResponse(400, { message: invalid_body_message }, origin);
        }

        const key = {
            club_account_id: body.club_account_id,
            user_id: user_id as string
        }

        const updateExpression = "SET #registration_payment_reference = :registration_payment_reference";
        const expressionAttributeNames = {
            "#registration_payment_reference": "registration_payment_reference"
        };
        const expressionAttributeValues = {
            ":registration_payment_reference": body.registration_payment_reference
        };

        await updateItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            key,
            updateExpression,
            expressionAttributeNames,
            expressionAttributeValues,
            "attribute_exists(user_id)"
        );

        return createResponse(200, { message: "Payment reference updated successfully." }, origin);

    } catch (error: any) {
        if (error.name === "ConditionalCheckFailedException") {
            console.error("Club member not found");
            return createResponse(400, { message: "Club member not found." }, origin);
        }
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
