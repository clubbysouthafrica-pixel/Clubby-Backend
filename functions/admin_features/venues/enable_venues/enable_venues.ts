import {
    createResponse,
    deconstructEvent,
    updateItem
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (!body.club_account_id) {
            return createResponse(400, { message: "Missing club_account_id in request body." }, origin);
        }
        if (body?.venues_enabled === undefined) {
            return createResponse(400, { message: "Venues Enabled must be set to true in request body." }, origin);
        }

        await updateItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id
            },
            `SET #venues_enabled = :venues_enabled`,
            {
                "#venues_enabled": "venues_enabled"
            },
            {
                ":venues_enabled": body.venues_enabled
            }
        );

        return createResponse(200, { message: "Venues enabled successfully." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};