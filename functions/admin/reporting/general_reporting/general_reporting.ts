import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3_client = new S3Client({ region: process.env.REGION });

const processReportData = (monthly_reports: Record<string, any>[]) => {
    let report: Record<string, any> = {
        total_active_members: 0,
        total_registered_members: 0,
        total_pending_members: 0,
        total_pending_revenue: 0,
        total_revenue: 0,
        total_deregistered_members: 0,
        total_registration_pending_revenue: 0,
        total_registration_revenue: 0
    };

    monthly_reports?.forEach(monthly_report => {
        if (!report.data) {
            report.data = [];
        }

        report.data.push({
            date: monthly_report.year_month,
            total_registered_members: monthly_report?.total_registered_members ?? 0,
            total_pending_members: monthly_report?.total_pending_members ?? 0,
            total_pending_revenue: monthly_report?.total_pending_revenue ?? 0,
            total_revenue: monthly_report?.total_revenue ?? 0,
            total_deregistered_members: monthly_report?.total_deregistered_members ?? 0,
            total_registration_pending_revenue: monthly_report?.total_registration_pending_revenue ?? 0,
            total_registration_revenue: monthly_report?.total_registration_revenue ?? 0
        });

        report.total_registered_members += monthly_report?.total_registered_members ?? 0;
        report.total_pending_members += monthly_report?.total_pending_members ?? 0;
        report.total_pending_revenue += monthly_report?.total_pending_revenue ?? 0;
        report.total_revenue += monthly_report?.total_revenue ?? 0;
        report.total_deregistered_members += monthly_report?.total_deregistered_members ?? 0;
        report.total_registration_pending_revenue += monthly_report?.total_registration_pending_revenue ?? 0;
        report.total_registration_revenue += monthly_report?.total_registration_revenue ?? 0;
        
        report.total_active_members = report.total_registered_members - report.total_deregistered_members;
    });

    return report;
};

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        let monthly_reports: Record<string, any>[] = [];

        if (query_string_params?.season_cycle) {
            if (!query_string_params.club_account_id) {
                return createResponse(400, { message: "club_account_id is required." }, origin);
            }

            const s3Key = `${query_string_params.club_account_id}/Season_${query_string_params.season_cycle}/ClubReporting.json`;
            
            try {
                console.log(`@@@ getObject request (Bucket_Name: ${process.env.HISTORICAL_REPORTING_BUCKET_NAME}, Key: ${s3Key}): `, s3Key);
                const s3Object = await s3_client.send(
                    new GetObjectCommand({
                        Bucket: process.env.CLUB_HISTORY_BUCKET_NAME as string,
                        Key: s3Key,
                    })
                );
                console.log(`@@@ getObject response (Bucket_Name: ${process.env.HISTORICAL_REPORTING_BUCKET_NAME}, Key: ${s3Key}): `, s3Object);

                const bodyContents = await s3Object.Body?.transformToString();
                const s3Data = JSON.parse(bodyContents || '[]');
                monthly_reports = Array.isArray(s3Data) ? s3Data : [];
            } catch (err: any) {
                const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
                if (status === 404) {
                    return createResponse(404, { message: "Reporting data not found for the specified season." }, origin);
                }
                console.error(`Error fetching S3 object ${s3Key}:`, err);
                throw err;
            }
        } else {
            monthly_reports = await queryItems(
                process.env.CLUB_REPORTING_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id },
                process.env.CLUB_ACCOUNT_ID_INDEX as string
            ) || [];
        }

        const report = processReportData(monthly_reports);
        return createResponse(200, report, origin);

    } catch (error: any) {
        console.error('General reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
