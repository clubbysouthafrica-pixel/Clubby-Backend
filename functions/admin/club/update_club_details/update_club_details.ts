import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

function validateBody(body: Record<string, string>): string | null {
    if (body?.club_account_id == null || body?.description == null) {
        return "Invalid body. Required attributes: club_account_id."
    }
    if (typeof body.club_account_id !== 'string' || typeof body.description !== "string") {
        return "Invalid body. Required attribute types: club_account_id (string)."
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

        await updateItem(
            process.env.CLUB_TABLE_NAME as string,
            key,
            "SET #description = :description",
            { "#description": "description" },
            { ":description": body.description }
        )
        return createResponse(200, { message: "Club updated successfully." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
