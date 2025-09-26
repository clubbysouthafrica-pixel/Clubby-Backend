import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const report = await queryItems(
            process.env.REGISTRATION_REPORTING_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        )

        if (!report) {
            return createResponse(200, { report: [] }, origin)
        }

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
