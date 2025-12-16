import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

interface CustomPaymentMethod {
    name: string;
    url: string;
}

function validateBody(body: Record<string, any>): string | null {
    if (body?.club_account_id == null) {
        return "Invalid body. Required attributes: club_account_id."
    }
    if (typeof body.club_account_id !== 'string') {
        return "Invalid body. Required attribute types: club_account_id (string)."
    }

    return null
}

function validateCustomPaymentMethods(methods: any): boolean {
    if (!Array.isArray(methods)) {
        return false;
    }

    return methods.every((method: any) => {
        return typeof method === 'object' &&
            typeof method.name === 'string' &&
            typeof method.url === 'string' &&
            method.name.trim() !== '' &&
            method.url.trim() !== '';
    });
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const invalid_body_message = validateBody(body);
        if (invalid_body_message) {
            return createResponse(400, { message: invalid_body_message }, origin);
        }

        const key = {
            club_account_id: body.club_account_id
        }

        let updateExpression = "SET ";
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        const updateParts: string[] = [];

        if (body?.custom_payment_methods !== undefined) {
            if (typeof body.custom_payment_methods === 'string' && body.custom_payment_methods === '') {
                updateParts.push("#custom_payment_methods = :custom_payment_methods");
                expressionAttributeNames["#custom_payment_methods"] = "custom_payment_methods";
                expressionAttributeValues[":custom_payment_methods"] = [];
            } else if (Array.isArray(body.custom_payment_methods)) {
                if (!validateCustomPaymentMethods(body.custom_payment_methods)) {
                    return createResponse(400, { 
                        message: "Invalid custom_payment_methods. Each method must have 'name' and 'url' as non-empty strings." 
                    }, origin);
                }

                updateParts.push("#custom_payment_methods = :custom_payment_methods");
                expressionAttributeNames["#custom_payment_methods"] = "custom_payment_methods";
                expressionAttributeValues[":custom_payment_methods"] = body.custom_payment_methods;
            } else if (body.custom_payment_methods === null) {
                updateParts.push("#custom_payment_methods = :custom_payment_methods");
                expressionAttributeNames["#custom_payment_methods"] = "custom_payment_methods";
                expressionAttributeValues[":custom_payment_methods"] = [];
            }
        }

        if (updateParts.length === 0) {
            return createResponse(200, { message: "Nothing to update." }, origin);
        }

        updateExpression += updateParts.join(", ");

        await updateItem(
            process.env.CLUB_TABLE_NAME as string,
            key,
            updateExpression,
            expressionAttributeNames,
            expressionAttributeValues,
            "attribute_exists(club_account_id)"
        );

        return createResponse(200, { message: "Custom payment methods updated successfully." }, origin);

    } catch (error: any) {
        if (error.name === "ConditionalCheckFailedException") {
            console.error("Club does not exist");
        }
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
