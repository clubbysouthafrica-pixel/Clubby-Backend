import {
    createResponse,
    deconstructEvent,
    updateItem,
    getItem,
    sendSqsMessage,
    getClubEmailSendingLimit
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

async function partialRegistrationUpdateTransactionsTable(
    club_account_id: string,
    current_reg_transaction_id: string,
    payment_amount: number
) {
    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: current_reg_transaction_id
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
            ":payment_amount": payment_amount,
            ":lifecycleValue": {
                type: "CONFIRMATION",
                description: "Payment confirmation",
                amount: payment_amount,
                payment_type: "EFT/Cash"
            }
        }
    );
}

async function partialRegistrationUpdateClubReportingTable(
    club_account_id: string,
    year: number,
    month: string,
    payment_amount: number
) {
    await updateItem(
        process.env.CLUB_REPORTING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: `${year}/${month}`
        },
        `SET 
            #total_revenue = if_not_exists(#total_revenue, :zero) + :payment_amount,
            #total_pending_revenue = if_not_exists(#total_pending_revenue, :zero) - :payment_amount,
            #total_registration_revenue = if_not_exists(#total_registration_revenue, :zero) + :payment_amount,
            #total_registration_pending_revenue = if_not_exists(#total_registration_pending_revenue, :zero) - :payment_amount
        `,
        {
            "#total_revenue": "total_revenue",
            "#total_registration_revenue": "total_registration_revenue",
            "#total_registration_pending_revenue": "total_registration_pending_revenue",
            "#total_pending_revenue": "total_pending_revenue"
        },
        {
            ":zero": 0,
            ":payment_amount": payment_amount,
        }
    )
}

async function updateClubReportingTable(
    club_account_id: string,
    year: number,
    month: string,
    payment_amount: number
) {
    await updateItem(
        process.env.CLUB_REPORTING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: `${year}/${month}`
        },
        `SET 
            #total_registered_members = if_not_exists(#total_registered_members, :zero) + :one,
            #total_revenue = if_not_exists(#total_revenue, :zero) + :payment_amount,
            #total_registration_revenue = if_not_exists(#total_registration_revenue, :zero) + :payment_amount,
            #total_registration_pending_revenue = if_not_exists(#total_registration_pending_revenue, :zero) - :payment_amount,
            #total_pending_members = if_not_exists(#total_pending_members, :zero) - :one,
            #total_pending_revenue = if_not_exists(#total_pending_revenue, :zero) - :payment_amount
        `,
        {
            "#total_registered_members": "total_registered_members",
            "#total_registration_pending_revenue": "total_registration_pending_revenue",
            "#total_registration_revenue": "total_registration_revenue",
            "#total_revenue": "total_revenue",
            "#total_pending_members": "total_pending_members",
            "#total_pending_revenue": "total_pending_revenue"
        },
        {
            ":one": 1,
            ":zero": 0,
            ":payment_amount": payment_amount,
        }
    )
}

async function partialRegistrationUpdateRegistrationsTable(
    member_id: string,
    current_reg_id: string,
    payment_amount: number
) {
    await updateItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: member_id,
            registration_id: current_reg_id
        },
        "SET #total_outstanding_amount = #total_outstanding_amount - :payment_amount",
        {
            "#total_outstanding_amount": "total_outstanding_amount"
        },
        {
            ":payment_amount": payment_amount
        }
    );
}

async function updateRegistrationsTable(
    member_id: string,
    current_reg_id: string,
    registered_on: number
) {
    await updateItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: member_id,
            registration_id: current_reg_id
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
}

async function updateTransactionsTable(
    club_account_id: string,
    current_reg_transaction_id: string,
    registered_on: number,
    payment_amount: number
) {
    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: current_reg_transaction_id
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
                amount: payment_amount,
                payment_type: "EFT/Cash"
            }
        }
    );
}

async function updateClubMember(
    club_account_id: string,
    member_id: string,
) {
    await updateItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            user_id: member_id,
            club_account_id: club_account_id,
        },
        "SET #reg = :registered",
        {
            "#reg": "registered"
        },
        {
            ":registered": true
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

        const registration = await getItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                user_id: club_member.user_id,
                registration_id: club_member.current_reg_id
            }
        )
        if (!registration) {
            return createResponse(400, { message: "Registration fee does not exist." }, origin);
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        if (registration.total_outstanding_amount > body.payment_amount) {

            await partialRegistrationUpdateTransactionsTable(body.club_account_id, club_member.current_reg_transaction_id, body.payment_amount)
            await partialRegistrationUpdateClubReportingTable(body.club_account_id, year, month, body.payment_amount)
            await partialRegistrationUpdateRegistrationsTable(body.member_id, club_member.current_reg_id, body.payment_amount)

            return createResponse(200, { registered: false, message: "Member outstanding balance updated." }, origin);
        }

        const registered_on = Date.now()

        await updateClubsRegistrationBilling(
            body.club_account_id,
            registration.total_fee * (club.member_registration_fee_to_club / 100)
        );

        if (body.payment_amount > 0) await updateTransactionsTable(body.club_account_id, club_member.current_reg_transaction_id, registered_on, body.payment_amount)
        await updateClubReportingTable(body.club_account_id, year, month, body.payment_amount)
        await updateRegistrationsTable(body.member_id, club_member.current_reg_id, registered_on)
        await updateClubMember(body.club_account_id, body.member_id)

        if (club?.use_success_email_template) {

            const club_sending_limit = await getClubEmailSendingLimit(body.club_account_id, [club_member.member_email]);
            if (typeof club_sending_limit === 'string') {
                return createResponse(200, { message: club_sending_limit }, origin);
            }


            let finalBody = club.registration_success_email_template_body
                .replace(/{{member_name}}/g, `${club_member.member_first_name} ${club_member.member_surname}`)
                .replace(/{{club_name}}/g, club.club_name)
                .replace(/{{club_email}}/g, club.support_email);

            await sendSqsMessage(
                process.env.SEND_EMAIL_QUEUE_URL as string,
                {
                    emails: [club_member.member_email],
                    subject: `Registration Submission for ${club.club_name}`,
                    email_body: finalBody,
                    club_account_id: body.club_account_id,
                    ...club_sending_limit
                },
                "ChargeableEmails"
            );
        }

        return createResponse(200, { registered: true, message: "Member outstanding balance updated." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
