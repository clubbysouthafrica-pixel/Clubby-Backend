import {
    createResponse,
    deconstructEvent,
    updateItem,
    getItem,
} from "./function_helpers";

async function updateClubsRegistrationBilling(club_account_id: string, fee: number) {
    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    await updateItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month,
        },
        `SET 
            #total_registered_users = if_not_exists(#total_registered_users, :zero) + :one,
            #total_amount = if_not_exists(#total_amount, :zero) + :member_registration_fee,
            #outstanding_amount = if_not_exists(#outstanding_amount, :zero) + :member_registration_fee
        `,
        {
            "#total_registered_users": "total_registered_users",
            "#total_amount": "total_amount",
            "#outstanding_amount": "outstanding_amount",
        },
        {
            ":one": 1,
            ":zero": 0,
            ":member_registration_fee": fee,
        }
    );
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null || body.member_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id, member_id requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string' || typeof body.member_id !== 'string') {
            return createResponse(400, { message: "club_account_id, member_id must be STRING type." }, origin);
        }

        const member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                user_id: body.member_id,
                club_account_id: body.club_account_id,
            }
        );

        if (member == null) {
            return createResponse(400, { message: "Member does not exist." }, origin);
        }

        if (member.registered) {
            return createResponse(400, { message: "Member already registered." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            { club_account_id: body.club_account_id }
        );
        if (!club) {
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        await updateClubsRegistrationBilling(body.club_account_id, club.member_registration_fee);

        await updateItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                user_id: body.member_id,
                club_account_id: body.club_account_id,
            },
            "SET #reg = :registered, #amount = :amount, #registered_on = :registered_on",
            {
                "#reg": "registered",
                "#amount": "outstanding_amount",
                "#registered_on": "registered_on"
            },
            {
                ":registered": true,
                ":amount": 0,
                ":registered_on": new Date().toISOString()
            }
        );

        return createResponse(200, { message: "User successfully registered." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
