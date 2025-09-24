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
        if (typeof body.club_account_id !== 'string' || typeof body.member_id !== 'string' || typeof body.payment_amount !== 'number') {
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

        const registration_fee = await getItem(
            process.env.REGISTRATION_FEES_TABLE_NAME as string,
            {
                user_id: club_member.user_id,
                registration_id: club_member.current_reg_id
            }
        )
        if (!registration_fee) {
            return createResponse(400, { message: "Registration fee does not exist." }, origin);
        }

        if (registration_fee.total_outstanding_amount > body.payment_amount) {
            await updateItem(
                process.env.TRANSACTIONS_TABLE_NAME as string,
                {
                    club_account_id: body.club_account_id,
                    transaction_id: club_member.current_reg_transaction_id
                },
                `SET #amount_paid = #amount_paid + :payment_amount, #status = :status, #lifecycle.#ts = :lifecycleValue`,
                {
                    "#amount_paid": "amount_paid",
                    "#status": "status",
                    "#lifecycle": "lifecycle",
                    "#ts": `${Date.now()}`
                },
                {
                    ":status": "PARTIALLY PAID",
                    ":payment_amount": body.payment_amount,
                    ":lifecycleValue": {
                        type: "CONFIRMATION",
                        description: "Payment confirmation",
                        amount: body.payment_amount
                    }
                }
            );

            await updateItem(
                process.env.REGISTRATION_FEES_TABLE_NAME as string,
                {
                    user_id: body.member_id,
                    registration_id: club_member.current_reg_id
                },
                "SET #total_outstanding_amount = #total_outstanding_amount - :payment_amount",
                {
                    "#total_outstanding_amount": "total_outstanding_amount"
                },
                {
                    ":payment_amount": body.payment_amount
                }
            );

            return createResponse(200, { registered: false, message: "Member outstanding balance updated." }, origin);
        }

        await updateClubsRegistrationBilling(body.club_account_id, club.member_registration_fee_to_club);

        const registered_on = Date.now()

        await updateItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id,
                transaction_id: club_member.current_reg_transaction_id
            },
            `SET #amount_paid = #amount, #status = :status, #lifecycle.#ts = :lifecycleValue`,
            {
                "#amount_paid": "amount_paid",
                "#amount": "amount",
                "#status": "status",
                "#lifecycle": "lifecycle",
                "#ts": `${registered_on}`
            },
            {
                ":status": "PAID",
                ":lifecycleValue": {
                    type: "CONFIRMATION",
                    description: "Payment confirmation",
                    amount: body.payment_amount
                }
            }
        );

        await updateItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                user_id: body.member_id,
                club_account_id: body.club_account_id,
            },
            "SET #reg = :registered, #registered_on = :registered_on",
            {
                "#reg": "registered",
                "#registered_on": "registered_on"
            },
            {
                ":registered": true,
                ":registered_on": registered_on
            }
        );

        await updateItem(
            process.env.REGISTRATION_FEES_TABLE_NAME as string,
            {
                user_id: body.member_id,
                registration_id: club_member.current_reg_id
            },
            "SET #total_outstanding_amount = :zero, #registered_on = :registered_on",
            {
                "#total_outstanding_amount": "total_outstanding_amount",
                "#registered_on": "registered_on"
            },
            {
                ":zero": 0,
                ":registered_on": registered_on
            }
        )

        return createResponse(200, { registered: true, message: "Member outstanding balance updated." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
