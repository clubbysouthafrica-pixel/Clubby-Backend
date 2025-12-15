import { createResponse, deconstructEvent, getItem } from "./function_helpers";

async function getRegistrationField(club_account_id: string, field_id: string): Promise<any | null> {
    return await getItem(
        process.env.REGISTRATION_FORM_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            field_id: field_id
        }
    );
}

export const handler = async (event: any) => {

    const { origin, query_string_params } = deconstructEvent(event);

    try {
        if (query_string_params?.club_account_id == null || query_string_params?.field_id == null) {
            return createResponse(400, { message: "club_account_id and field_id required in query string params." }, origin);
        }

        if (typeof query_string_params.club_account_id !== 'string' || typeof query_string_params.field_id !== 'string') {
            return createResponse(400, { message: "club_account_id and field_id must be STRING type." }, origin);
        }

        const field = await getRegistrationField(
            query_string_params.club_account_id,
            query_string_params.field_id
        );

        if (!field) {
            return createResponse(404, { message: "Registration field not found." }, origin);
        }

        return createResponse(200, { field }, origin);

    } catch (error: any) {
        console.error('Get registration field error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
