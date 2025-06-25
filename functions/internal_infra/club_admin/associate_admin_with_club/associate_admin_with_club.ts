import { createResponse, ACCESS, getItem, addItem, deconstructEvent } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
            return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
        }

        if (body?.club_account_id == null || body?.access == null) {
            return createResponse(400, { message: "club_account_id, and access required." }, origin);
        }

        if (!ACCESS.includes(body.access)) {
            return createResponse(400, { message: `Invalid access. Valid values: ${ACCESS}.` }, origin);
        }

        const user = await getItem(process.env.USERS_TABLE_NAME as string, {
            user_type: "ADMIN",
            user_id: user_id as string
        });
        if (user == null) {
            return createResponse(200, { message: "User not found." }, origin);
        }


        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: body.club_account_id
        })
        if (club == null) {
            return createResponse(200, { message: "Club not found." }, origin);
        }

        await addItem(
            process.env.CLUB_ADMIN_ACCOUNT_TABLE_NAME as string,
            {
                "user_id": user_id as string,
                "club_account_id": body.club_account_id,
                "club_type": club.club_type as string,
                "access": body.access
            }
        )

        return createResponse(200, { message: "Admin successfully associated with club." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
