import { createResponse, deconstructEvent, removeItem,  } from "./function_helpers";



export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);
    try {
       
        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: 'club_account_id required.' }, origin);
        }
        if (!Array.isArray(body.member_ids) || body.member_ids.length === 0) {
            return createResponse(400, { message: 'member_ids (array) required in body.' }, origin);
        }
        if (body.member_ids.length > 25) {
            return createResponse(400, { message: 'Maximum of 25 members can be removed at a time.' }, origin);
        }

        await Promise.all(
            body.member_ids.map((member_id: string) =>
                removeItem(
                    process.env.CLUB_MEMBER_TABLE_NAME as string,
                    {
                        club_account_id: query_string_params.club_account_id,
                        user_id: member_id
                    }
                )
            )
        );

        return createResponse(200, { message: `${body.member_ids.length} member(s) successfully removed.` }, origin);

    } catch (error: any) {
        console.error('Remove member error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
