import {
    createResponse,
    deconstructEvent,
    getItem,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id required in query string." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const storage_requests = await queryItems(
            process.env.STORAGE_REQUESTS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        );

        if (!storage_requests || storage_requests.length === 0) {
            return createResponse(200, { message: "Storage requests check passed." }, origin);
        }

        for (const storage_request of storage_requests) {
            if (!storage_request?.paid) {
                return createResponse(211, { message: "Storage requests check failed. Unpaid storage request(s) found." }, origin);
            }
        }

        return createResponse(200, { message: "Storage requests check passed." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
