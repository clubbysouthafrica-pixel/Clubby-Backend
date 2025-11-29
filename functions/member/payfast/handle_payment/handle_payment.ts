import { getItem, queryItems, sendSqsMessage, updateItem, getClubEmailSendingLimit } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";
import {
    CognitoIdentityProviderClient,
    AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({ region: process.env.REGION });

export async function getUserSubByUsername(username: string): Promise<string | null> {
    try {
        const res = await client.send(
            new AdminGetUserCommand({
                UserPoolId: process.env.USER_POOL_ID,
                Username: username,
            })
        );

        const sub = res.UserAttributes?.find((a) => a.Name === "sub")?.Value ?? null;
        return sub;
    } catch (err: any) {
        if (err.name === "UserNotFoundException") return null;
        console.error("AdminGetUser error:", err);
        return null
    }
}

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
                payment_type: "Online/Card"
            }
        }
    );
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
            #total_revenue = if_not_exists(#total_revenue, :zero) + :payment_amount,
            #total_registration_revenue = if_not_exists(#total_registration_revenue, :zero) + :payment_amount,
            #total_registration_pending_revenue = if_not_exists(#total_registration_pending_revenue, :zero) - :payment_amount,
            #total_pending_revenue = if_not_exists(#total_pending_revenue, :zero) - :payment_amount,
            #total_registered_members = if_not_exists(#total_registered_members, :zero) + :one,
            #total_pending_members = if_not_exists(#total_pending_members, :zero) - :one
        `,
        {
            "#total_registration_pending_revenue": "total_registration_pending_revenue",
            "#total_registration_revenue": "total_registration_revenue",
            "#total_revenue": "total_revenue",
            "#total_pending_revenue": "total_pending_revenue",
            "#total_registered_members": "total_registered_members",
            "#total_pending_members": "total_pending_members",
        },
        {
            ":zero": 0,
            ":one": 1,
            ":payment_amount": payment_amount,
        }
    )
}

async function updateRegistrationsTable(
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
        "SET #total_outstanding_amount = #total_outstanding_amount - :payment_amount, #registered_on = :registered_on",
        {
            "#total_outstanding_amount": "total_outstanding_amount",
            "#registered_on": "registered_on"
        },
        {
            ":payment_amount": payment_amount,
            ":registered_on": Date.now()
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

    const email = params.get("email_address") ?? "";
    const user_id = await getUserSubByUsername(email)

    if (!user_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const clubs = await queryItems(
        process.env.CLUB_TABLE_NAME as string,
        "club_name = :club_name",
        { ":club_name": params.get("item_description") ?? "" },
        process.env.CLUB_NAME_INDEX as string
    );
    if (clubs?.length !== 1) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: clubs[0].club_account_id,
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
            clubs[0].club_account_id,
            club_member.current_reg_transaction_id,
            amount_paid
        );

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        await updateClubReportingTable(
            clubs[0].club_account_id,
            year,
            month,
            amount_paid
        );

        await updateRegistrationsTable(
            user_id,
            club_member.current_reg_id,
            amount_paid
        );

        await updateClubMembersTable(
            clubs[0].club_account_id,
            user_id
        );

        await updateClubsRegistrationBilling(
            clubs[0].club_account_id,
            registration.total_fee * (clubs[0].member_registration_fee_to_club / 100)
        );

        if (clubs[0]?.use_success_email_template) {

            const club_sending_limit = await getClubEmailSendingLimit(clubs[0].club_account_id, [club_member.member_email], clubs[0]);
            if (typeof club_sending_limit === 'string') {
                console.log(`⚠️ ${club_sending_limit}`);
                return { statusCode: 200, body: "OK" };
            }


            let finalBody = clubs[0].registration_success_email_template_body
                .replace(/{{member_name}}/g, `${club_member.member_first_name} ${club_member.member_surname}`)
                .replace(/{{club_name}}/g, clubs[0].club_name)
                .replace(/{{club_email}}/g, clubs[0].support_email);

            await sendSqsMessage(
                process.env.SEND_EMAIL_QUEUE_URL as string,
                {
                    emails: [club_member.member_email],
                    subject: `Registration Submission for ${clubs[0].club_name}`,
                    email_body: finalBody,
                    club_account_id: clubs[0].club_account_id,
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
