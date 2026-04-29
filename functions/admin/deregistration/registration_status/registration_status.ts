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

        const registrations = await queryItems(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX as string
        );

        if (!registrations || registrations.length === 0) {
            return createResponse(200, { message: "Shop de-registration check passed." }, origin);
        }

        for (const registration of registrations) {
            if (registration?.deregistered) continue;
            if (registration?.registered_on) continue;

            return createResponse(211, { message: "There are still pending registrations. Please resolve them before de-registering.", id: registration.registration_id }, origin);
        }

        return createResponse(200, { message: "Shop de-registration check passed." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
