import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);

    const { origin, body, query_string_params } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        )

        if (club_members == null) {
            return createResponse(200, { registered: [], not_registered: [] }, origin);
        }

        const registered: any[] = []
        const unregistered: any[] = []

        club_members.forEach(item => {
            delete item.club_account_id

            if (item.registered) {
                registered.push(item)
            } else {
                unregistered.push(item)
            }
        })

        return createResponse(200, { registered, unregistered }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
