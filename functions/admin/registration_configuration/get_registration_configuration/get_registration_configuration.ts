import { createResponse, deconstructEvent, getItem, DEFAULT_REGISTRATION_CONFIGURATION } from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, query_string_params } = deconstructEvent(event);

    try {
        const club_account_id = query_string_params?.club_account_id;
        if (!club_account_id) {
            return createResponse(400, { message: "Missing club_account_id in query parameters." }, origin);
        }

        const item = await getItem(
            process.env.REGISTRATION_CONFIGURATION_TABLE_NAME as string,
            { club_account_id }
        );

        // Only expose keys the backend defines; anything not yet saved falls back to its default.
        const configuration = Object.fromEntries(
            Object.entries(DEFAULT_REGISTRATION_CONFIGURATION).map(([key, defaultValue]) => [key, item?.[key] ?? defaultValue])
        );

        return createResponse(200, { club_account_id, configuration }, origin);

    } catch (error: any) {
        console.error("Get registration configuration error:", error);
        return createResponse(500, { message: error?.message || "Internal Server Error" }, origin);
    }
};
