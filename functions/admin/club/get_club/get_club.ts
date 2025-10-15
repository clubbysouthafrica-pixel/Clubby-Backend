import { createResponse, deconstructEvent, getItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }

        const item = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (item == null) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        return createResponse(200, {
            club_account_id: item["club_account_id"],
            club_type: item["club_type"],
            season_cycle: item?.season_cycle ?? 1,
            club_name: item["club_name"],
            description: item["description"] ?? undefined,
            address: item["address"] ?? undefined,
            support_email: item["support_email"],
            country_of_operation: item["country_of_operation"],
            joined: item["joined"]
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
