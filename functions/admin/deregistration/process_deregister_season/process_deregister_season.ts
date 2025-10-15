import {
    createResponse,
    deconstructEvent,
    getItem,
    sendSqsMessage,
    updateItem
} from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (body?.club_account_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id requried in query string parameters." }, origin);
        }
        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                "club_account_id": body.club_account_id
            }
        )

        if (!club) {
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        await updateItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                "club_account_id": body.club_account_id
            },
            `SET 
                #deregistration_in_progress = :true
            `,
            {
                "#deregistration_in_progress": "deregistration_in_progress"
            },
            {
                ":true": true
            }
        );

        await sendSqsMessage(
            process.env.DEREGISTRATION_QUEUE_URL as string,
            {
                club_account_id: body.club_account_id
            },
            "DEREGISTER_ALL_MEMBERS"
        );

        return createResponse(200, { message: "Season deregistration in progress." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
}
