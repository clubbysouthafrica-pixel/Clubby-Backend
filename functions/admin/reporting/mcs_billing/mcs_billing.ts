import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
    createResponse,
    deconstructEvent,
    getItem,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const monthly_billing = await queryItems(
            process.env.MONTHLY_BILLING_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        );

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            { "club_account_id": query_string_params.club_account_id }
        );
        if (!club) {
            return createResponse(500, { message: "Club does not exist." }, origin);
        }

        const report: Record<string, any> = {};
        report["MCS charge per registration"] = club.member_registration_fee_to_club
        report["Total free emails per month"] = club.free_email_limit
        report["MCS charge per email"] = club.fee_per_email_to_club
        report["MCS total outstanding amount"] = 0

        monthly_billing?.forEach(month => {
            report["MCS total outstanding amount"] += month?.outstanding_amount ?? 0

            report[month.year_month] = {}
            report[month.year_month]["MCS monthly outstanding amount"] = month.outstanding_amount
            report[month.year_month]["MCS total monthly charge"] = month.total_amount

            report[month.year_month]["Registration"] = {}
            report[month.year_month]["Registration"]["Total registered users"] = month?.total_registered_users ?? 0
            report[month.year_month]["Registration"]["MCS registration charge"] = month?.registration_amount ?? 0

            report[month.year_month]["Emails"] = {}
            report[month.year_month]["Emails"]["Total emails sent"] = month?.total_emails ?? 0
            report[month.year_month]["Emails"]["MCS email charge"] = month?.email_amount ?? 0
        });

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('MSC Billing reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
