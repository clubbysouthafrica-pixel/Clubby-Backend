import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const clubs = await queryItems(
            process.env.CLUB_ADMIN_TABLE_NAME as string,
            "user_id = :user_id",
            { ":user_id": user_id as string }
        )

        if (clubs == null) {
            return createResponse(200, { items: [] }, origin);
        }

        const items = await Promise.all(clubs.map(async item => {
            delete item.user_id;
        
            const club = await getItem(
                process.env.CLUB_TABLE_NAME as string,
                {
                    club_account_id: item.club_account_id,
                }
            );
            
            const form = await queryItems(
                process.env.REGISTRATION_FORM_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": club?.club_account_id }
            )
    
            const onboarded = Boolean(
                form &&
                club?.["country_of_operation"] &&
                club?.["currency"] &&
                club?.["account_type"] &&
                club?.["branch_code"] &&
                club?.["account_number"] &&
                club?.["bank"]
            );
        
            item.currency = club?.currency;
            item.onboarded = onboarded
            item.season_cycle = club?.season_cycle ?? 1
        
            return item;
        }));
        
        return createResponse(200, { items }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
