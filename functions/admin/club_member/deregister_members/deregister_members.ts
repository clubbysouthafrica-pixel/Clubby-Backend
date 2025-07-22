import {
    createResponse,
    deconstructEvent,
    queryItems,
    removeItem
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        )

        club_members?.forEach(async club_member => {
            await removeItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    "club_account_id": body.club_account_id,
                    "user_id": club_member.user_id
                }
            )
        });

        return createResponse(200, { message: "Members successfully deregistered." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
