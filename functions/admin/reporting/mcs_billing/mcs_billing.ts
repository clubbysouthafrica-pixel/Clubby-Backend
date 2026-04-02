import {
    createResponse,
    deconstructEvent,
    getItem,
    queryItems,
    formatAmount
} from "./function_helpers";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3_client = new S3Client({ region: process.env.REGION });

const processBillingData = (monthly_billing: Record<string, any>[], club: Record<string, any>) => {
    const report: Record<string, any> = {
        Registrations: {
            month_data: [],
            "Total registration charge": 0,
            "Total registered users": 0,
            "Charge per registration": `${club.member_registration_fee_to_club}%`,
        },
        Emails: {
            month_data: [],
            "Total email charge": 0,
            "Total emails sent": 0,
            "Charge per email": formatAmount(club.fee_per_email_to_club, club.currency),
            "Monthly email limit": club.maximum_monthly_emails
        },
        Orders: {
            month_data: [],
            "Total sales": 0,
            "Charge per order": `2%`
        },
        Payments: [],
        total_outstanding_amount: 0,
        total_email_amount: 0,
        total_registration_amount: 0,
        total_charge: 0,
        total_order_amount: 0
    };

    monthly_billing?.forEach(month => {
        report.total_outstanding_amount += month?.outstanding_amount ?? 0
        report.total_email_amount += month?.email_amount ?? 0
        report.total_registration_amount += month?.registration_amount ?? 0
        report.total_charge += month.total_amount
        report.total_order_amount += month?.order_amount ?? 0

        report.Payments.push({
            month: month.year_month,
            month_paid: month?.month_paid ?? false,
            payment_date: month?.payment_date ?? undefined,
        });

        report.Orders["Total sales"] += month?.total_sales ?? 0

        const registration_month_data = {
            name: month.year_month ?? 0,
            users: month?.total_registered_users ?? 0,
            charge: month?.registration_amount ?? 0
        }
        report.Registrations.month_data.push(registration_month_data)

        if (month?.total_emails) {
            const email_month_data = {
                name: month.year_month ?? 0,
                emails: month?.total_emails,
                charge: month?.email_amount
            }
            report.Emails.month_data.push(email_month_data)
        }

        if (month?.order_amount) { 
            const order_month_data = {
                name: month.year_month ?? 0,
                sales: month?.total_sales ?? 0,
                charge: month?.order_amount ?? 0
            }
            report.Orders.month_data.push(order_month_data)
        }

        report.Registrations["Total registration charge"] += month?.registration_amount ?? 0
        report.Registrations["Total registered users"] += month?.total_registered_users ?? 0

        report.Emails["Total email charge"] += month?.email_amount ?? 0
        report.Emails["Total emails sent"] += month?.total_emails ?? 0

        if (!report.overall_month_data) {
            report.overall_month_data = {}
        }
        report.overall_month_data[month.year_month] = {}
        report.overall_month_data[month.year_month].email_amount = month?.email_amount ?? 0
        report.overall_month_data[month.year_month].registration_amount = month?.registration_amount ?? 0
        report.overall_month_data[month.year_month].total_amount = month.total_amount
        report.overall_month_data[month.year_month].order_amount = month?.order_amount ?? 0
    });

    report.Registrations["Total registration charge"] = formatAmount(report.Registrations["Total registration charge"], club.currency)
    report.Emails["Total email charge"] = formatAmount(report.Emails["Total email charge"], club.currency)

    return report;
};

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            { "club_account_id": query_string_params.club_account_id }
        );
        if (!club) {
            return createResponse(500, { message: "Club does not exist." }, origin);
        }

        let monthly_billing: Record<string, any>[] = [];

        if (query_string_params?.season_cycle) {
            if (!query_string_params.club_account_id) {
                return createResponse(400, { message: "club_account_id is required." }, origin);
            }

            const s3Key = `${query_string_params.club_account_id}/Season_${query_string_params.season_cycle}/MonthlyBilling.json`;
            
            try {
                const s3Object = await s3_client.send(
                    new GetObjectCommand({
                        Bucket: process.env.CLUB_HISTORY_BUCKET_NAME as string,
                        Key: s3Key,
                    })
                );

                const bodyContents = await s3Object.Body?.transformToString();
                const s3Data = JSON.parse(bodyContents || '[]');
                monthly_billing = Array.isArray(s3Data) ? s3Data : [];
            } catch (err: any) {
                const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
                if (status === 404) {
                    return createResponse(404, { message: "Billing data not found for the specified season." }, origin);
                }
                console.error(`Error fetching S3 object ${s3Key}:`, err);
                throw err;
            }
        } else {
            monthly_billing = await queryItems(
                process.env.MONTHLY_BILLING_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id },
                process.env.CLUB_ACCOUNT_ID_INDEX as string
            ) || [];
        }
        
        monthly_billing.sort((a, b) => {
            const dateA = a.year_month ?? '';
            const dateB = b.year_month ?? '';
            return dateA.localeCompare(dateB);
        });

        const report = processBillingData(monthly_billing, club);
        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('MSC Billing reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
