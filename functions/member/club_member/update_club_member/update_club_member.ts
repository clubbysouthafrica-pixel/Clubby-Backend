import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, user_id } = deconstructEvent(event);

    try {
        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "club_account_id is required and must be a string." }, origin);
        }

        if (body?.email_opt_in === undefined || typeof body.email_opt_in !== "boolean") {
            return createResponse(400, { message: "email_opt_in is required and must be a boolean." }, origin);
        }

        await updateItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id,
                user_id: user_id as string,
            },
            "SET #email_opt_in = :email_opt_in",
            { "#email_opt_in": "email_opt_in" },
            { ":email_opt_in": body.email_opt_in }
        );

        return createResponse(200, { message: "Club member updated successfully." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
