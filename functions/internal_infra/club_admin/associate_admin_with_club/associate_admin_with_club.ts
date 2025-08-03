import { createResponse, ACCESS, getItem, addItem, deconstructEvent } from "./function_helpers";

export const handler = async (event: any) => {

    const origin = event.headers.origin;
    const body = JSON.parse(event.body);

    try {

        if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
            return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
        }

        if (body?.club_account_id == null || body?.access == null || body?.user_id == null) {
            return createResponse(400, { message: "club_account_id, user_id, and access required." }, origin);
        }

        if (!ACCESS.includes(body.access)) {
            return createResponse(400, { message: `Invalid access. Valid values: ${ACCESS}.` }, origin);
        }

        const user = await getItem(process.env.USERS_TABLE_NAME as string, {
            user_type: "ADMIN",
            user_id: body.user_id as string
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
                "user_id": body.user_id as string,
                "club_account_id": body.club_account_id,
                "club_type": club.club_type as string,
                "club_name": club.club_name as string,
                "access": body.access
            },
            "attribute_not_exists(user_id)"
        )

        return createResponse(200, { message: "Admin successfully associated with club." }, origin);

    } catch (error: any) {
        console.error("Error:", error);

        if (error.message === "The conditional request failed") {
            return createResponse(400, { message: "Admin already associated with club." }, origin);
        }

        return createResponse(500, { message: error.message }, origin);
    }
};
