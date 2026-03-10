import { createResponse, deconstructEvent, removeItem, } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);
    try {
        if (!body.registration_id || typeof body.registration_id !== 'string' || !body.user_id || typeof body.user_id !== 'string') {
            return createResponse(400, { message: 'registration_id and user_id required in body.' }, origin);
        }

        const registration = await removeItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                user_id: body.user_id,
                registration_id: body.registration_id
            },
            true
        );


        if (registration && registration?.transaction_id) {
            await removeItem(
                process.env.TRANSACTIONS_TABLE_NAME as string,
                {
                    club_account_id: registration.club_account_id,
                    transaction_id: registration.transaction_id
                }
            )
        }

        return createResponse(200, { message: `Registration successfully removed.` }, origin);

    } catch (error: any) {
        console.error('Remove member error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
