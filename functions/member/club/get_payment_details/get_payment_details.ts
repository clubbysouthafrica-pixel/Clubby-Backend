import { createResponse, deconstructEvent, getItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, query_string_params } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (club == null) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const eft_enabled = club.eft_enabled !== false;

        return createResponse(200, {
            eft_details: eft_enabled
                ? {
                    bank: club["bank"],
                    account_number: club["account_number"],
                    branch_code: club["branch_code"],
                    account_type: club["account_type"],
                }
                : null,
            snapscan_enabled: club["snapscan_enabled"] ?? false,
            payfast_enabled: club["payfast_enabled"] ?? false,
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
