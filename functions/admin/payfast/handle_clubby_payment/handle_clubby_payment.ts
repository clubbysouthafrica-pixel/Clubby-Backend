import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { addItem, formatAmount, getItem, queryItems, updateItem } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";
import { randomUUID } from "crypto";

const sesClient = new SESClient({ region: process.env.REGION });

type MonthlyBillingRecord = {
    club_account_id?: string;
    club_name?: string;
    year_month: string;
    email_amount?: number;
    month_paid?: boolean;
    order_amount?: number;
    support_email: string;
    outstanding_amount?: number;
    payment_date?: number;
    registration_amount?: number;
    total_amount: number;
    total_emails?: number;
    total_registered_users?: number;
    total_sales?: number;
};

function roundDownToSecondDecimalPlace(amount: number): number {
    return Math.floor(amount * 100) / 100;
}

function getCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getNumberValue(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function formatBillingMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split("-").map(Number);

    if (!year || !month) {
        return yearMonth;
    }

    return new Date(year, month - 1, 1).toLocaleString("en-ZA", {
        month: "long",
        year: "numeric"
    });
}

function buildInvoiceEmail(month: MonthlyBillingRecord) {
    const billingMonth = month.year_month ?? "Unknown month";
    const clubName = month.club_name ?? "your club";
    const formattedBillingMonth = formatBillingMonth(billingMonth);
    const registrationCount = getNumberValue(month.total_registered_users);
    const registrationAmount = getNumberValue(month.registration_amount);
    const totalEmails = getNumberValue(month.total_emails);
    const emailAmount = getNumberValue(month.email_amount);
    const totalSales = getNumberValue(month.total_sales);
    const orderAmount = getNumberValue(month.order_amount);
    const totalAmount = getNumberValue(month.total_amount) || registrationAmount + emailAmount + orderAmount;
    const invoiceDate = new Date().toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const lineItems = [
        {
            description: "Registered users",
            quantity: registrationCount,
            amount: registrationAmount,
            detail: "Clubby registration charges"
        },
        {
            description: "Emails sent",
            quantity: totalEmails,
            amount: emailAmount,
            detail: "Clubby email charges"
        },
        {
            description: "Sales made",
            quantity: totalSales,
            amount: orderAmount,
            detail: "Clubby order charges"
        }
    ];

    const rowsHtml = lineItems.map((item) => `
                <tr>
                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
                        <div style="font-weight:600;color:#111827;">${item.description}</div>
                        <div style="margin-top:4px;font-size:13px;color:#6b7280;">${item.detail}</div>
                    </td>
                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#111827;">${item.quantity}</td>
                    <td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111827;">${formatAmount(item.amount, "ZAR")}</td>
                </tr>`).join("");

    const html = `
        <html>
            <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial, Helvetica, sans-serif;color:#111827;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="720" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border:1px solid #e5e7eb;">
                                <tr>
                                    <td style="padding:32px;border-bottom:3px solid #111827;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="vertical-align:top;">
                                                    <div style="font-size:28px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Invoice</div>
                                                    <div style="margin-top:10px;font-size:15px;color:#4b5563;">Billing month: ${formattedBillingMonth} (${billingMonth})</div>
                                                    <div style="margin-top:4px;font-size:15px;color:#4b5563;">Invoice date: ${invoiceDate}</div>
                                                    <div style="margin-top:4px;font-size:15px;color:#4b5563;">Club: ${month.club_name ?? "Unknown club"}</div>
                                                </td>
                                                <td style="vertical-align:top;text-align:right;">
                                                    <div style="font-size:22px;font-weight:700;">Clubby</div>
                                                    <div style="margin-top:10px;font-size:14px;line-height:1.6;color:#4b5563;">
                                                        Business number: 0727187289<br/>
                                                        8 Avenue De Chevonnes<br/>
                                                        Hout Bay Cape Town 7806
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:32px;">
                                        <p style="margin:0 0 20px 0;font-size:15px;line-height:1.7;color:#374151;">This invoice covers Clubby charges for ${clubName} for ${formattedBillingMonth}. The breakdown below includes registration charges, email charges, and sales-related charges for the billing period.</p>
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e7eb;">
                                            <thead>
                                                <tr style="background:#f9fafb;">
                                                    <th style="padding:12px;text-align:left;border-bottom:1px solid #e5e7eb;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;">Description</th>
                                                    <th style="padding:12px;text-align:center;border-bottom:1px solid #e5e7eb;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;">Quantity</th>
                                                    <th style="padding:12px;text-align:right;border-bottom:1px solid #e5e7eb;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;">Charge</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${rowsHtml}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colspan="2" style="padding:16px;text-align:right;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #111827;">Total</td>
                                                    <td style="padding:16px;text-align:right;font-size:18px;font-weight:700;color:#111827;border-top:2px solid #111827;">${formatAmount(totalAmount, "ZAR")}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
        </html>`;

    const text = [
        `Clubby Invoice`,
        `Club: ${clubName}`,
        `Billing month: ${formattedBillingMonth} (${billingMonth})`,
        `Business number: 0727187289`,
        `Address: 8 Avenue De Chevonnes Hout Bay Cape Town 7806`,
        ``,
        `Registered users: ${registrationCount} | Charge: ${formatAmount(registrationAmount, "ZAR")}`,
        `Emails sent: ${totalEmails} | Charge: ${formatAmount(emailAmount, "ZAR")}`,
        `Sales made: ${totalSales} | Charge: ${formatAmount(orderAmount, "ZAR")}`,
        ``,
        `Total: ${formatAmount(totalAmount, "ZAR")}`
    ].join("\n");

    return {
        subject: `Clubby invoice for ${formattedBillingMonth}`,
        html,
        text
    };
}

async function sendInvoiceEmail(month: MonthlyBillingRecord) {
    const sourceEmail = `admin@${process.env.DOMAIN as string}`;
    const invoiceEmail = buildInvoiceEmail(month);

    const command = new SendEmailCommand({
        Destination: {
            ToAddresses: [month.support_email]
        },
        Message: {
            Subject: {
                Charset: "UTF-8",
                Data: invoiceEmail.subject
            },
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: invoiceEmail.html
                },
                Text: {
                    Charset: "UTF-8",
                    Data: invoiceEmail.text
                }
            }
        },
        Source: sourceEmail
    });

    await sesClient.send(command);
}

async function addToTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    amount: number,
    year_month: string
) {
    await addItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            name: "Clubby",
            club_income: false,
            transaction_id: transaction_id,
            amount: amount,
            amount_paid: amount,
            creation_date: Date.now(),
            lifecycle: {
                [Date.now()]: {
                    description: `Clubby charges for month: ${year_month}`,
                    amount: amount,
                    type: "CONFIRMATION"
                }
            },
            type: "CLUBBY",
            status: "PAID"
        }
    )
}

async function updateMonthlyBillingTable(
    club_account_id: string,
    year_month: string,
    payment_amount: number
) {

    await updateItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month
        },
        "SET #outstanding_amount = #outstanding_amount - :payment_amount, #month_paid = :month_paid, #payment_date = :payment_date",
        {
            "#outstanding_amount": "outstanding_amount",
            "#month_paid": "month_paid",
            "#payment_date": "payment_date"
        },
        {
            ":payment_amount": payment_amount,
            ":month_paid": true,
            ":payment_date": Date.now()
        }
    );
}

export const handler = async (event: any) => {
    console.log('Received event:', JSON.stringify(event));
    const passPhrase = process.env.PAYFAST_PASSPHRASE;
    const currentYearMonth = getCurrentYearMonth();

    const bodyString = event.body || "";
    console.log('Event Body:', bodyString);
    const params = new URLSearchParams(bodyString);

    const club_account_id = params.get("custom_str1") ?? undefined;
    const custom_str2 = params.get("custom_str2") ?? undefined;

    if (!club_account_id) {
        return { statusCode: 200, body: "Invalid payment" };
    }
    if (!custom_str2) {
        return { statusCode: 200, body: "Invalid payment" };
    }

    const club = await getItem(
        process.env.CLUB_TABLE_NAME as string,
        {
            club_account_id: club_account_id
        }
    );
    if (!club) {
        return { statusCode: 200, body: "Invalid payment" };
    }

    const months = []

    if (custom_str2 === "PAY_ALL") {
        const allMonths = await queryItems(
            process.env.MONTHLY_BILLING_TABLE_NAME as string,
            "club_account_id = :club_account_id",
            { ":club_account_id": club_account_id }
        ) as MonthlyBillingRecord[];

        if (!allMonths) {
            return { statusCode: 200, body: "Invalid payment" };
        }

        for (const month of allMonths) {
            if (month.month_paid === true || month.year_month === currentYearMonth) {
                continue;
            }
            months.push(month);
        }

        if (months.length === 0) {
            return { statusCode: 200, body: "Invalid payment" };
        }
    } else {
        const month = await getItem(
            process.env.MONTHLY_BILLING_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                year_month: custom_str2
            }
        ) as MonthlyBillingRecord;

        if (month == null || month.month_paid === true || month.year_month === currentYearMonth) {
            return { statusCode: 200, body: "Invalid payment" };
        }

        months.push(month);
    }

    const amount_to_be_paid = roundDownToSecondDecimalPlace(months.reduce((total, month) => total + getNumberValue(month.total_amount), 0));

    if (amount_to_be_paid <= 0) {
        return { statusCode: 200, body: "Invalid payment" };
    }

    const isValid = await validatePayFastPayment(
        {
            headers: event.headers,
            body: Object.fromEntries(new URLSearchParams(event.body)),
            connection: { remoteAddress: event.requestContext?.identity?.sourceIp },
        },
        amount_to_be_paid / 100,
        passPhrase
    );

    if (isValid) {
        console.log("✅ Payment verified successfully");

        for (const month of months) {
            const transaction_id = randomUUID();

            await addToTransactionsTable(
                club_account_id,
                transaction_id,
                month.total_amount,
                month.year_month
            );

            await updateMonthlyBillingTable(
                club_account_id,
                month.year_month,
                month.total_amount
            );

            try {
                await sendInvoiceEmail({
                    ...month,
                    club_account_id,
                    club_name: club.club_name,
                    year_month: month.year_month,
                    support_email: club?.support_email
                });
            } catch (error) {
                console.error("Failed to send Clubby invoice email:", error);
            }
        }
    }

    return { statusCode: 200, body: "OK" };
};
