import {
    createResponse,
    deconstructEvent,
    getItem,
    updateItem
} from "./function_helpers";

async function updateClubMemberTable(user_id: string, club_account_id: string) {
    await updateItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            "club_account_id": club_account_id,
            "user_id": user_id
        },
        `SET 
            #registered = :registered,
            #resubmission_required = :resubmission_required
        `,
        {
            "#registered": "registered",
            "#resubmission_required": "resubmission_required"
        },
        {
            ":registered": false,
            ":resubmission_required": true
        }
    );
}

async function updateRegistrationsTable(user_id: string, registration_id: string, reason: string) {
    await updateItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            "registration_id": registration_id,
            "user_id": user_id
        },
        `SET 
            #deregistered = :deregistered,
            #deregistered_on = :deregistered_on,
            #deregistration_reason = :deregistration_reason
        `,
        {
            "#deregistered": "deregistered",
            "#deregistered_on": "deregistered_on",
            "#deregistration_reason": "deregistration_reason"
        },
        {
            ":deregistered": true,
            ":deregistered_on": Date.now(),
            ":deregistration_reason": reason
        }
    );
}

async function updateTransactionsTable(club_account_id: string, transaction_id: string) {
    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: transaction_id
        },
        `SET #status = :status, #lifecycle.#ts = :lifecycleValue`,
        {
            "#status": "status",
            "#lifecycle": "lifecycle",
            "#ts": `${Date.now()}`
        },
        {
            ":status": "CANCELLED",
            ":lifecycleValue": {
                type: "CANCELLATION",
                description: "Transaction cancelled due to member deregistration",
                amount: "N/A",
                payment_type: "N/A"
            }
        }
    );
}

async function processRefund(user_id: string, club_account_id: string, registration: any, member: any) {
    await updateItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            "registration_id": member.current_reg_id,
            "user_id": user_id
        },
        `SET #outstanding = :outstanding`,
        {
            "#outstanding": "total_outstanding_amount"
        },
        {
            ":outstanding": registration.total_fee
        }
    );

    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: member.current_reg_transaction_id
        },
        `SET #refund_amount = :refund_amount, #refund_completed = :refund_completed, #amount_paid = :amount_paid, #status = :status, #lifecycle.#ts = :lifecycleValue`,
        {
            "#status": "status",
            "#lifecycle": "lifecycle",
            "#refund_completed": "refund_completed",
            "#amount_paid": "amount_paid",
            "#refund_amount": "refund_amount",
            "#ts": `${Date.now()}`
        },
        {
            ":status": "REFUND",
            ":refund_completed": false,
            ":refund_amount": registration.total_fee - registration.total_outstanding_amount,
            ":amount_paid": 0,
            ":lifecycleValue": {
                type: "REFUND",
                description: "Refund issued due to member deregistration",
                amount: registration.total_fee - registration.total_outstanding_amount,
                payment_type: "REFUND"
            }
        }
    );
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null || body?.user_ids == null) {
            return createResponse(400, { message: "Invalid request. club_account_id, user_id required in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }
        if (!Array.isArray(body.user_ids)) {
            return createResponse(400, { message: "user_ids must be ARRAY type." }, origin);
        }

        const refunds = body?.refunds ?? [];

        for (const user_id of body.user_ids) {
            const member = await getItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    "club_account_id": body.club_account_id,
                    "user_id": user_id
                },
            )
            if (!member) {
                console.log(`User, ${user_id}, does not exist as a club member for club, ${body.club_account_id}.`)
                continue
            }

            const registration = await getItem(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                {
                    "registration_id": member.current_reg_id,
                    "user_id": member.user_id
                },
            );
            if (!registration) {
                console.log(`User, ${user_id}, does not have a valid registration, ${member.current_reg_id}.`)
                continue
            }

            if (refunds.includes(user_id) && registration.total_outstanding_amount < registration.total_fee) {
                await processRefund(user_id, body.club_account_id, registration, member);
            } else if (registration.total_outstanding_amount > 0) {
                await updateTransactionsTable(body.club_account_id, member.current_reg_transaction_id);
            }

            await updateClubMemberTable(member.user_id, body.club_account_id);
            await updateRegistrationsTable(member.user_id, member.current_reg_id, body?.deregistration_reason ?? "Deregistered by admin")
        }

        return createResponse(200, { message: "Successfully deregistered members" }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
