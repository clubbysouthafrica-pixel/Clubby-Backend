import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const monthly_reports = await queryItems(
            process.env.CLUB_REPORTING_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        );

        let report: Record<string, any> = {}

        report = {
            total_active_members: 0,
            total_registered_members: 0,
            total_pending_members: 0,
            total_pending_revenue: 0,
            total_revenue: 0,
            total_deregistered_members: 0
        }

        monthly_reports?.forEach(monthly_report => {
            if (!report.data) {
                report.data = []
            }

            report.data.push({
                date: monthly_report.year_month,
                total_registered_members: monthly_report?.total_registered_members ?? 0,
                total_pending_members: monthly_report?.total_pending_members ?? 0,
                total_pending_revenue: monthly_report?.total_pending_revenue ?? 0,
                total_revenue: monthly_report?.total_revenue ?? 0,
                total_deregistered_members: monthly_report?.total_deregistered_members ?? 0
            })

            report.total_registered_members += monthly_report?.total_registered_members ?? 0
            report.total_pending_members += monthly_report?.total_pending_members ?? 0
            report.total_pending_revenue += monthly_report?.total_pending_revenue ?? 0
            report.total_revenue += monthly_report?.total_revenue ?? 0
            report.total_deregistered_members += monthly_report?.total_deregistered_members ?? 0
            
            report.total_active_members = report.total_registered_members - report.total_deregistered_members
        });

        return createResponse(200, report, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
