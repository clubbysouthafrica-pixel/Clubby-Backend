import { createResponse, deconstructEvent, removeItem,  } from "./function_helpers";



export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);
    try {
       
        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: 'club_account_id required.' }, origin);
        }
        if (body.member_id == null || typeof body.member_id !== 'string') {
            return createResponse(400, { message: 'member_id (string) required in body.' }, origin);
        }

        await removeItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                user_id: body.member_id
            }
        );

        return createResponse(200, { message: "Member successfully removed." }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
