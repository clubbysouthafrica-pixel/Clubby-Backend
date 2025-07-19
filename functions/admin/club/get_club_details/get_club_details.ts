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
            bank: item.bank_details ? item["bank"] : undefined,
            account_number: item.bank_details ? item["account_number"] : undefined,
            branch_code: item.bank_details ? item["branch_code"] : undefined,
            account_type: item.bank_details ? item["account_type"] : undefined
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
