import { createResponse, getClubEmailSendingLimit, getItem, removeItem, sendSqsMessage, updateItem, autoDeliverOrderItems, sendOrderConfirmationEmail } from "./function_helpers";

type SnapScanWebhookPayload = {
    id?: number;
    status?: string;
    totalAmount?: number;
    tipAmount?: number;
    feeAmount?: number;
    settleAmount?: number;
    requiredAmount?: number;
    date?: string;
    snapCode?: string;
    snapCodeReference?: string;
    userReference?: string | null;
    merchantReference?: string;
    statementReference?: string | null;
    authCode?: string;
    deliveryAddress?: string | null;
    deviceSerialNumber?: string | null;
    extra?: Record<string, unknown>;
    isVoucher?: boolean;
    isVoucherRedemption?: boolean;
    paymentType?: string;
    transactionType?: string;
};

const getOrigin = (event: any) => event.headers?.origin || event.headers?.Origin || process.env.ALLOWED_ORIGIN || "";

const decodeRequestBody = (event: any): string => {
    if (typeof event.body !== "string") {
        return "";
    }

    if (event.isBase64Encoded) {
        return Buffer.from(event.body, "base64").toString("utf8");
    }

    return event.body;
};

const parseSnapScanPayload = (event: any): SnapScanWebhookPayload => {
    const bodyString = decodeRequestBody(event);
    const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(bodyString);
        const payload = params.get("payload");

        if (!payload) {
            throw new Error("Missing SnapScan payload.");
        }

        return JSON.parse(payload) as SnapScanWebhookPayload;
    }

    const parsedBody = JSON.parse(bodyString || "{}");

    if (typeof parsedBody?.payload === "string") {
        return JSON.parse(parsedBody.payload) as SnapScanWebhookPayload;
    }

    if (parsedBody?.payload && typeof parsedBody.payload === "object") {
        return parsedBody.payload as SnapScanWebhookPayload;
    }

    return parsedBody as SnapScanWebhookPayload;
};

async function updateTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    payment_amount: number,
    reference: string,
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
                payment_type: "SnapScan",
                payment_reference: reference
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

async function updateClubsStorageBilling(club_account_id: string, fee: number) {
    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    await updateItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month,
        },
        `SET 
            #total_amount = if_not_exists(#total_amount, :zero) + :storage_fee,
            #outstanding_amount = if_not_exists(#outstanding_amount, :zero) + :storage_fee,
            #storage_amount = if_not_exists(#storage_amount, :zero) + :storage_fee,
            #month_paid = :month_paid
        `,
        {
            "#total_amount": "total_amount",
            "#outstanding_amount": "outstanding_amount",
            "#storage_amount": "storage_amount",
            "#month_paid": "month_paid"
        },
        {
            ":zero": 0,
            ":storage_fee": fee,
            ":month_paid": false
        }
    );
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
            #registration_amount = if_not_exists(#registration_amount, :zero) + :member_registration_fee,
            #month_paid = :month_paid
        `,
        {
            "#total_registered_users": "total_registered_users",
            "#total_amount": "total_amount",
            "#outstanding_amount": "outstanding_amount",
            "#registration_amount": "registration_amount",
            "#month_paid": "month_paid"
        },
        {
            ":one": 1,
            ":zero": 0,
            ":member_registration_fee": fee,
            ":month_paid": false
        }
    );
}

async function updateRegistrationsTable(
    member_id: string,
    current_reg_id: string,
    payment_amount: number,
    shouldAutoRegisterMember: boolean,
    removeTtl: boolean = false,
) {
    const paymentHistoryEntry = {
        date: Date.now(),
        amount: payment_amount,
        is_revenue: true
    };

    const baseNames: Record<string, string> = shouldAutoRegisterMember
        ? {
            "#total_outstanding_amount": "total_outstanding_amount",
            "#registered_on": "registered_on",
            "#payment_history": "payment_history"
        }
        : {
            "#total_outstanding_amount": "total_outstanding_amount",
            "#payment_history": "payment_history"
        };
    const expressionNames = removeTtl ? { ...baseNames, "#ttl": "ttl" } : baseNames;

    const setClause = shouldAutoRegisterMember
        ? "SET #total_outstanding_amount = #total_outstanding_amount - :payment_amount, #registered_on = :registered_on, #payment_history = list_append(if_not_exists(#payment_history, :empty_list), :payment_entry)"
        : "SET #total_outstanding_amount = #total_outstanding_amount - :payment_amount, #payment_history = list_append(if_not_exists(#payment_history, :empty_list), :payment_entry)";

    await updateItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: member_id,
            registration_id: current_reg_id
        },
        removeTtl ? `${setClause} REMOVE #ttl` : setClause,
        expressionNames,
        shouldAutoRegisterMember
            ? {
                ":payment_amount": payment_amount,
                ":registered_on": Date.now(),
                ":payment_entry": [paymentHistoryEntry],
                ":empty_list": []
            }
            : {
                ":payment_amount": payment_amount,
                ":payment_entry": [paymentHistoryEntry],
                ":empty_list": []
            }
    );
}

async function updateClubMembersTable(
    club_account_id: string,
    member_id: string,
    removeTtl: boolean = false,
) {
    const expressionNames: Record<string, string> = { "#reg": "registered" };
    if (removeTtl) expressionNames["#ttl"] = "ttl";

    await updateItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            user_id: member_id,
            club_account_id: club_account_id,
        },
        removeTtl ? "SET #reg = :registered REMOVE #ttl" : "SET #reg = :registered",
        expressionNames,
        {
            ":registered": true
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

async function updateStorageTable(
    club_account_id: string,
    storage_id: string,
) {
    await updateItem(
        process.env.STORAGE_TABLE_NAME as string,
        {
            club_account_id,
            storage_id,
        },
        "SET #isBooked = :isBooked",
        {
            "#isBooked": "isBooked"
        },
        {
            ":isBooked": true
        }
    );
}

async function updateStorageRequestTable(
    club_account_id: string,
    storage_request_id: string,
    payment_amount: number,
    payment_method: string
) {
    const storageRequest = await getItem(
        process.env.STORAGE_REQUESTS_TABLE_NAME as string,
        {
            club_account_id,
            storage_request_id
        }
    );

    if (!storageRequest) {
        throw new Error("Associated storage request not found.");
    }

    await updateItem(
        process.env.STORAGE_REQUESTS_TABLE_NAME as string,
        {
            club_account_id,
            storage_request_id
        },
        "SET #status = :status, #paid = :paid, #costCents = :costCents, #paymentMethod = :paymentMethod, #updatedAt = :updatedAt",
        {
            "#status": "status",
            "#paid": "paid",
            "#costCents": "costCents",
            "#paymentMethod": "paymentMethod",
            "#updatedAt": "updatedAt"
        },
        {
            ":status": "approved",
            ":paid": true,
            ":costCents": payment_amount,
            ":paymentMethod": payment_method,
            ":updatedAt": new Date().toISOString()
        }
    );

    if (storageRequest.storage_id) {
        await updateStorageTable(club_account_id, storageRequest.storage_id);
    }
}

export const handler = async (event: any) => {
    const origin = getOrigin(event);
    console.log("Received event:", JSON.stringify(event));

    try {
        const payload = parseSnapScanPayload(event);

        if (!payload.merchantReference) {
            return createResponse(200, { message: "Merchant Reference is required." }, origin);
        }

        const existingPayment = await getItem(
            process.env.SNAPSCAN_PAYMENTS_TABLE_NAME as string,
            { merchant_reference: payload.merchantReference }
        );
        if (!existingPayment) {
            return createResponse(200, { message: "Payment record not found." }, origin);
        }
        if (existingPayment.paid) {
            return createResponse(200, { message: "Payment has already been processed." }, origin);
        }

        const club_account_id = existingPayment.club_account_id;

        const transaction = await getItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                transaction_id: existingPayment.transaction_id
            }
        )
        if (!transaction) {
            return createResponse(200, { message: "Associated transaction not found." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                club_account_id: club_account_id
            }
        );
        if (!club) {
            return createResponse(200, { message: "Associated club not found." }, origin);
        }

        let removeTtlOnTransaction = false;

        if (transaction.type === "REGISTRATION") {

            const club_member = await getItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    user_id: transaction.user_id
                }
            );
            if (!club_member) {
                return createResponse(200, { message: "Associated club member not found." }, origin);
            }

            const removeTtl = club.eft_enabled === false;
            removeTtlOnTransaction = removeTtl;

            await updateRegistrationsTable(
                transaction.user_id,
                club_member.current_reg_id,
                payload.totalAmount || 0,
                club?.auto_register_members_if_paid_snapscan === true,
                removeTtl,
            );

            if (club?.auto_register_members_if_paid_snapscan === true) {
                await updateClubMembersTable(
                    club_account_id,
                    transaction.user_id,
                    removeTtl,
                );
            }

            await updateClubsRegistrationBilling(
                club_account_id,
                (payload.totalAmount || 0) * (club.member_registration_fee_to_club / 100)
            );

            if (club.use_success_email_template && club?.auto_register_members_if_paid_snapscan === true) {

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


        } else if (transaction.type === "STORAGE") {
            if (!transaction.storage_request_id) {
                return createResponse(200, { message: "Associated storage request not found." }, origin);
            }

            await updateStorageRequestTable(
                club_account_id,
                transaction.storage_request_id,
                payload.totalAmount || 0,
                payload.paymentType || "SnapScan"
            );

            await updateClubsStorageBilling(club_account_id, (payload.totalAmount || 0) * 0.02);

        } else if (transaction.type === "ORDER") {

            const order = await getItem(
                process.env.ORDERS_TABLE_NAME as string,
                { club_account_id, order_id: transaction.order_id! }
            );

            const orderRemoveTtl = club.eft_enabled === false;
            removeTtlOnTransaction = orderRemoveTtl;

            await updateOrdersTable(club_account_id, transaction.order_id!, payload.totalAmount || 0, orderRemoveTtl);
            await updateClubsOrderBilling(club_account_id, (payload.totalAmount || 0) * 0.03);

            if (orderRemoveTtl && transaction.user_id) {
                await removeClubMemberTtl(club_account_id, transaction.user_id);
            }

            if (order) {
                await autoDeliverOrderItems(order, process.env.ORDERS_TABLE_NAME!, process.env.PRODUCT_TABLE_NAME!);
            }

            const order_club_member = await getItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                { club_account_id, user_id: transaction.user_id }
            );
            if (order_club_member?.member_email && order) {
                await sendOrderConfirmationEmail(
                    order_club_member.member_email,
                    order.first_name,
                    club?.club_name ?? "",
                    club_account_id,
                    transaction.order_id!,
                    order.items ?? [],
                    order.total_amount,
                    club?.currency ?? "ZAR",
                );
            }

        } else if (transaction.type === "EVENT REGISTRATION") {

            const event = await getItem(
                process.env.EVENTS_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    event_id: transaction.event_id
                }
            );

            await updateEventRegistrationsTable(
                transaction.event_id,
                transaction.event_registration_id!,
                payload.totalAmount || 0,
                event?.auto_confirm_registrations || false
            );
            await updateClubsEventRegistrationBilling(club_account_id, (payload.totalAmount || 0) * 0.03);

        } else {
            return createResponse(200, { message: `Transaction type ${transaction.type} not supported.` }, origin);
        }

        await updateTransactionsTable(
            existingPayment.club_account_id,
            existingPayment.transaction_id,
            payload.totalAmount || 0,
            payload.merchantReference,
            removeTtlOnTransaction,
        );
        await updateItem(
            process.env.SNAPSCAN_PAYMENTS_TABLE_NAME as string,
            { merchant_reference: payload.merchantReference },
            "SET #paid = :paid",
            {
                "#paid": "paid"
            },
            {
                ":paid": true
            }
        )

        return createResponse(200, { message: "Payment complete." }, origin);
    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        return createResponse(200, { message: message }, origin);
    }
};

