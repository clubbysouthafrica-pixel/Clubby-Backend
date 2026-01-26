import { getItem, queryItems, sendSqsMessage, updateItem, getClubEmailSendingLimit } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";

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

async function updateTransactionsTable(
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
            ":status": "PAID",
            ":payment_amount": payment_amount,
            ":lifecycleValue": {
                type: "CONFIRMATION",
                description: "Payment confirmation",
                amount: payment_amount,
                payment_type: "PayFast"
            }
        }
    );
}

async function updateRegistrationsTable(
    member_id: string,
    current_reg_id: string,
    payment_amount: number
) {
    const paymentHistoryEntry = {
        date: Date.now(),
        amount: payment_amount,
        is_revenue: true
    };

    await updateItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: member_id,
            registration_id: current_reg_id
        },
        "SET #total_outstanding_amount = #total_outstanding_amount - :payment_amount, #registered_on = :registered_on, #payment_history = list_append(if_not_exists(#payment_history, :empty_list), :payment_entry)",
        {
            "#total_outstanding_amount": "total_outstanding_amount",
            "#registered_on": "registered_on",
            "#payment_history": "payment_history"
        },
        {
            ":payment_amount": payment_amount,
            ":registered_on": Date.now(),
            ":payment_entry": [paymentHistoryEntry],
            ":empty_list": []
        }
    );
}

async function updateClubMembersTable(
    club_account_id: string,
    member_id: string
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
    const passPhrase = process.env.PAYFAST_PASSPHRASE;

    const bodyString = event.body || "";
    const params = new URLSearchParams(bodyString);

    const club_account_id = params.get("custom_str1") ?? undefined;
    const user_id = params.get("custom_str2") ?? undefined;

    if (!user_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!club_account_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const club = await getItem(
        process.env.CLUB_TABLE_NAME as string,
        { club_account_id: club_account_id }
    );
    if (club == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            user_id: user_id
        }
    );
    if (club_member == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const registration = await getItem(process.env.REGISTRATIONS_TABLE_NAME as string, {
        user_id: user_id as string,
        registration_id: club_member.current_reg_id
    });
    if (registration == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const amount_paid = registration.total_outstanding_amount;

    const isValid = await validatePayFastPayment(
        {
            headers: event.headers,
            body: Object.fromEntries(new URLSearchParams(event.body)),
            connection: { remoteAddress: event.requestContext?.identity?.sourceIp },
        },
        amount_paid / 100,
        passPhrase
    );

    if (isValid) {
        console.log("✅ Payment verified successfully");

        await updateTransactionsTable(
            club_account_id,
            club_member.current_reg_transaction_id,
            amount_paid
        );

        const now = new Date();

        await updateRegistrationsTable(
            user_id,
            club_member.current_reg_id,
            amount_paid
        );

        await updateClubMembersTable(
            club_account_id,
            user_id
        );

        await updateClubsRegistrationBilling(
            club_account_id,
            registration.total_fee * (club.member_registration_fee_to_club / 100)
        );

        if (club.use_success_email_template) {

            const club_sending_limit = await getClubEmailSendingLimit(club_account_id, [club_member.member_email], club);
            if (typeof club_sending_limit === 'string') {
                console.log(`⚠️ ${club_sending_limit}`);
                return { statusCode: 200, body: "OK" };
            }


            let finalBody = club.registration_success_email_template_body
                .replace(/{{member_name}}/g, `${club_member.member_first_name} ${club_member.member_surname}`)
                .replace(/{{club_name}}/g, club.club_name)
                .replace(/{{club_email}}/g, club.support_email);

            await sendSqsMessage(
                process.env.SEND_EMAIL_QUEUE_URL as string,
                {
                    emails: [club_member.member_email],
                    subject: club.registration_success_email_subject,
                    email_body: finalBody,
                    club_account_id,
                    ...club_sending_limit
                },
                "ChargeableEmails"
            );
        }

        return { statusCode: 200, body: "OK" };
    } else {
        console.error("❌ Payment verification failed");
        return { statusCode: 400, body: "Payment failed" };
    }
};
