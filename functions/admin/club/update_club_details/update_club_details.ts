import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

function validateBody(body: Record<string, string>): string | null {
    if (body?.club_account_id == null) {
        return "Invalid body. Required attributes: club_account_id."
    }
    if (typeof body.club_account_id !== 'string') {
        return "Invalid body. Required attribute types: club_account_id (string)."
    }

    if (body?.bank_details) {
        if (typeof body.bank_details !== 'object') {
            return "Invalid body. Required attribute types: bank_details (object)."
        }

        const bank_details: Record<string, string> = body.bank_details;

        if (bank_details.bank == null || bank_details.account_number == null || bank_details.branch_code == null || bank_details.account_type == null) {
            return "Invalid body. Required bank_details attribute types: bank, account_number, branch_code, account_type."
        }

        if (typeof bank_details.bank !== "string" || typeof bank_details.account_number !== "string" || typeof bank_details.branch_code !== "string" || typeof bank_details.account_type !== "string") {
            return "Invalid body. Required bank_details attribute types: bank (string), account_number (string), branch_code (string), account_type (string)."
        }
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
            club_account_id: body.club_account_id
        }

        let updateExpression = "SET #description = :description";
        const expressionAttributeNames: Record<string, string> = {
            "#description": "description"
        };
        const expressionAttributeValues: Record<string, any> = {
            ":description": { S: body.description }
        };

        if (body.bank_details) {
            const bankDetails = body.bank_details;
            updateExpression += ", #bank = :bank, #acc = :acc, #branch = :branch, #type = :type";

            expressionAttributeNames["#bank"] = "bank";
            expressionAttributeNames["#acc"] = "account_number";
            expressionAttributeNames["#branch"] = "branch_code";
            expressionAttributeNames["#type"] = "account_type";

            expressionAttributeValues[":bank"] = { S: bankDetails.bank };
            expressionAttributeValues[":acc"] = { S: bankDetails.account_number };
            expressionAttributeValues[":branch"] = { S: bankDetails.branch_code };
            expressionAttributeValues[":type"] = { S: bankDetails.account_type };
        }

        await updateItem(
            process.env.CLUB_TABLE_NAME as string,
            key,
            updateExpression,
            expressionAttributeNames,
            expressionAttributeValues,
            "attribute_exists(club_account_id)"
        );

        return createResponse(200, { message: "Club details updated successfully." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
