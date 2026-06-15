import { getItem, updateItem, autoDeliverOrderItems, sendOrderConfirmationEmail } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";

async function updateTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    payment_amount: number,
    removeTtl: boolean = false,
) {
    const expressionNames: Record<string, string> = {
        "#amount_paid": "amount_paid",
        "#status": "status",
        "#lifecycle": "lifecycle",
        "#ts": `${Date.now()}`
    };
    if (removeTtl) expressionNames["#ttl"] = "ttl";

    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: transaction_id
        },
        `SET #amount_paid = #amount_paid + :payment_amount, #status = :status, #lifecycle.#ts = :lifecycleValue${removeTtl ? " REMOVE #ttl" : ""}`,
        expressionNames,
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

async function updateOrdersTable(
    club_account_id: string,
    order_id: string,
    payment_amount: number,
    removeTtl: boolean = false,
) {
    const expressionNames: Record<string, string> = {
        "#amount_paid": "amount_paid",
        "#payment_status": "payment_status",
        "#fulfillment_status": "fulfillment_status"
    };
    if (removeTtl) expressionNames["#ttl"] = "ttl";

    await updateItem(
        process.env.ORDERS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            order_id: order_id
        },
        `SET #amount_paid = #amount_paid + :amount_paid, #payment_status = :payment_status, #fulfillment_status = :fulfillment_status${removeTtl ? " REMOVE #ttl" : ""}`,
        expressionNames,
        {
            ":amount_paid": payment_amount,
            ":payment_status": "PAID",
            ":fulfillment_status": "PROCESSING"
        }
    );
}

async function removeClubMemberTtl(club_account_id: string, member_id: string) {
    await updateItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        { user_id: member_id, club_account_id },
        "SET #reg = if_not_exists(#reg, :false) REMOVE #ttl",
        { "#reg": "registered", "#ttl": "ttl" },
        { ":false": false }
    );
}

async function updateClubsOrderBilling(club_account_id: string, fee: number) {
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
            #order_amount = if_not_exists(#order_amount, :zero) + :order_fee,
            #month_paid = :month_paid
        `,
        {
            "#total_amount": "total_amount",
            "#outstanding_amount": "outstanding_amount",
            "#order_amount": "order_amount",
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
    const order_id = params.get("custom_str3") ?? undefined;

    if (!user_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!club_account_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!order_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const [order, club] = await Promise.all([
        getItem(
            process.env.ORDERS_TABLE_NAME as string,
            { club_account_id: club_account_id, order_id: order_id }
        ),
        getItem(
            process.env.CLUB_TABLE_NAME as string,
            { club_account_id: club_account_id }
        ),
    ]);
    if (order == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    const amount_paid = order.total_amount - order.amount_paid;

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

        const removeTtl = club?.eft_enabled === false;

        await updateTransactionsTable(
            club_account_id,
            order.transaction_id,
            amount_paid,
            removeTtl,
        );

        await updateOrdersTable(
            club_account_id,
            order_id,
            amount_paid,
            removeTtl,
        );

        await updateClubsOrderBilling(club_account_id, order.total_amount * 0.02);
        await autoDeliverOrderItems(order, process.env.ORDERS_TABLE_NAME!, process.env.PRODUCT_TABLE_NAME!);

        if (removeTtl && user_id) {
            await removeClubMemberTtl(club_account_id, user_id);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            { club_account_id, user_id }
        );
        if (club_member?.member_email) {
            await sendOrderConfirmationEmail(
                club_member.member_email,
                order.first_name,
                club?.club_name ?? "",
                club_account_id,
                order_id,
                order.items ?? [],
                order.total_amount,
                club?.currency ?? "ZAR",
            );
        }
    }

    return { statusCode: 200, body: "OK" };
};
