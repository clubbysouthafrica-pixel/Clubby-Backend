import { getItem, updateItem } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";

async function updateTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    payment_amount: number
) {
    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: transaction_id
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

async function updateEventRegistrationsTable(
    event_id: string,
    event_registration_id: string,
    payment_amount: number,
    auto_confirm: boolean
) {
    const paymentHistoryEntry = {
        date: Date.now(),
        amount: payment_amount,
        is_revenue: true
    };

    await updateItem(
        process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
        {
            event_id: event_id,
            event_registration_id: event_registration_id
        },
        "SET #confirmed_status = :confirmed_status, #amount_paid = #amount_paid + :amount_paid, #payment_status = :payment_status, #payment_history = list_append(if_not_exists(#payment_history, :empty_list), :payment_entry)",
        {
            "#confirmed_status": "confirmed_status",
            "#amount_paid": "amount_paid",
            "#payment_status": "payment_status",
            "#payment_history": "payment_history"
        },
        {
            ":amount_paid": payment_amount,
            ":payment_status": "PAID",
            ":confirmed_status": auto_confirm,
            ":payment_entry": [paymentHistoryEntry],
            ":empty_list": []
        }
    );
}

async function updateClubsEventRegistrationBilling(club_account_id: string, fee: number) {
    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    await updateItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month,
        },
        `SET 
            #total_amount = if_not_exists(#total_amount, :zero) + :order_fee,
            #outstanding_amount = if_not_exists(#outstanding_amount, :zero) + :order_fee,
            #events_amount = if_not_exists(#events_amount, :zero) + :order_fee,
            #month_paid = :month_paid
        `,
        {
            "#total_amount": "total_amount",
            "#outstanding_amount": "outstanding_amount",
            "#events_amount": "events_amount",
            "#month_paid": "month_paid"
        },
        {
            ":zero": 0,
            ":order_fee": fee,
            ":month_paid": false
        }
    );
}

export const handler = async (event: any) => {
    console.log('Received event:', JSON.stringify(event));
    const passPhrase = process.env.PAYFAST_PASSPHRASE;

    const bodyString = event.body || "";
    console.log('Event Body:', bodyString);
    const params = new URLSearchParams(bodyString);

    const club_account_id = params.get("custom_str1") ?? undefined;
    const user_id = params.get("custom_str2") ?? undefined;
    const event_id = params.get("custom_str3") ?? undefined;
    const event_registration_id = params.get("custom_str4") ?? undefined;

    if (!user_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!club_account_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!event_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!event_registration_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const event_registration = await getItem(
        process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
        {
            event_id: event_id,
            event_registration_id: event_registration_id
        }
    );
    if (event_registration == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const selected_event = await getItem(
        process.env.EVENTS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            event_id: event_id
        }
    );
    if (selected_event == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const amount_paid = event_registration.entry_fee_amount - event_registration.amount_paid;

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
            event_registration.transaction_id,
            amount_paid
        );

        await updateEventRegistrationsTable(
            event_id,
            event_registration_id,
            amount_paid,
            selected_event?.autoConfirmIfPaid ?? true
        );

        await updateClubsEventRegistrationBilling(club_account_id, event_registration.entry_fee_amount * 0.02);
    }

    return { statusCode: 200, body: "OK" };
};
