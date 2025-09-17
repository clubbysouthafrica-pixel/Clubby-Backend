import {
    createResponse,
    deconstructEvent,
    updateItem,
    getItem,
    addItem,
} from "./function_helpers";
import { randomUUID } from 'crypto';

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
            #outstanding_amount = if_not_exists(#outstanding_amount, :zero) + :member_registration_fee,
            #registration_amount = if_not_exists(#registration_amount, :zero) + :member_registration_fee
        `,
        {
            "#total_registered_users": "total_registered_users",
            "#total_amount": "total_amount",
            "#outstanding_amount": "outstanding_amount",
            "#registration_amount": "registration_amount"
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

        if (body?.club_account_id == null || body?.member_id == null || body?.payment_amount == null) {
            return createResponse(400, { message: "Invalid request. club_account_id, member_id, payment_amount requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string' || typeof body.member_id !== 'string' || typeof body.payment_amount !== 'number' ) {
            return createResponse(400, { message: "club_account_id, member_id must be STRING type. payment_amount must be NUMBER type." }, origin);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                user_id: body.member_id,
                club_account_id: body.club_account_id,
            }
        );

        if (club_member == null) {
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        if (club_member.registered) {
            return createResponse(400, { message: "Member already registered." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            { club_account_id: body.club_account_id }
        );
        if (!club) {
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        if (club_member.outstanding_amount > body.payment_amount) {
            await updateItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    user_id: body.member_id,
                    club_account_id: body.club_account_id,
                },
                "SET #outstanding_amount = #outstanding_amount - :payment_amount",
                {
                    "#outstanding_amount": "outstanding_amount"
                },
                {
                    ":payment_amount": body.payment_amount
                }
            );

            await addItem(
                process.env.TRANSACTIONS_TABLE_NAME as string,
                {
                    club_account_id: body.club_account_id,
                    transaction_id: randomUUID(),
                    user_id: user_id as string,
                    date: new Date().getTime(),
                    amount: body.payment_amount,
                    description: "Registration payment",
                    type: "PAYMENT CONFIRMED"
                }
            )

            return createResponse(200, { registered: false, message: "Member outstanding balance updated." }, origin);
        }

        await updateClubsRegistrationBilling(body.club_account_id, club.member_registration_fee_to_club);

        await updateItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                user_id: body.member_id,
                club_account_id: body.club_account_id,
            },
            "SET #reg = :registered, #outstanding_amount = #outstanding_amount - :payment_amount, #registered_on = :registered_on",
            {
                "#reg": "registered",
                "#outstanding_amount": "outstanding_amount",
                "#registered_on": "registered_on"
            },
            {
                ":registered": true,
                ":payment_amount": body.payment_amount,
                ":registered_on": new Date().toISOString()
            }
        );

        await addItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id,
                transaction_id: randomUUID(),
                user_id: user_id as string,
                date: new Date().getTime(),
                amount: body.payment_amount,
                description: "Registration payment",
                type: "PAYMENT"
            }
        )

        return createResponse(200, { registered: true, message: "Member outstanding balance updated." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
