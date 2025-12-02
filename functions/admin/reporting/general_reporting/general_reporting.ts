import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3_client = new S3Client({ region: process.env.REGION });

function formatToYearMonth(timestamp: number): string {
    const date = new Date(timestamp);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${date.getFullYear()} ${monthNames[date.getMonth()]}`;
}

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

const processRegistrations = (report: Record<string, any>, registrations: Record<string, any>[]) => {
    registrations.forEach(registration => {
        if (registration.total_outstanding_amount === 0 && registration.deregistered === false) {
            report.total_active_members += 1;
        }
        if (registration.registered_on) {
            report.total_registered_members += 1;
        }
        if (registration.deregistered === false && registration.total_outstanding_amount > 0) {
            report.total_pending_members += 1;
        }
        if (registration.deregistered === true) {
            report.total_deregistered_members += 1;
        }

        const registration_submission_date = registration?.registration_submitted_on ? formatToYearMonth(registration.registration_submitted_on) : undefined;
        const registered_on_date = registration?.registered_on ? formatToYearMonth(registration.registered_on) : undefined;
        const deregistered_on = registration?.deregistered_on ? formatToYearMonth(registration.deregistered_on) : undefined;

        if (!report.data) {
            report.data = [];
        }

        if (registration_submission_date) {
            let existingEntry = report.data.find((entry: Record<string, any>) => entry.date === registration_submission_date);
            
            if (existingEntry) {
                existingEntry.total_pending_revenue = (existingEntry.total_pending_revenue || 0) + (registration?.deregistered === false ? registration.total_outstanding_amount : 0);
                existingEntry.total_pending_members = (existingEntry.total_pending_members || 0) + (registration?.deregistered === false && registration.total_outstanding_amount > 0 ? 1 : 0);
                existingEntry.total_registration_pending_revenue = (existingEntry.total_registration_pending_revenue || 0) + (registration?.deregistered === false ? registration.total_outstanding_amount : 0);
                existingEntry.total_revenue = (existingEntry.total_revenue || 0) + (registration.total_fee - registration.total_outstanding_amount);
                existingEntry.total_registration_revenue = (existingEntry.total_registration_revenue || 0) + (registration.total_fee - registration.total_outstanding_amount);
                
                if (registered_on_date) {
                    existingEntry.total_registered_members = (existingEntry.total_registered_members || 0) + 1;
                }
                if (deregistered_on) {
                    existingEntry.total_deregistered_members = (existingEntry.total_deregistered_members || 0) + 1;
                }
            } else {
                const newEntry: Record<string, any> = {
                    date: registration_submission_date,
                    total_registered_members: registered_on_date ? 1 : 0,
                    total_pending_members: registration.deregistered === false && registration.total_outstanding_amount > 0 ? 1 : 0,
                    total_pending_revenue: registration?.deregistered === false ? registration.total_outstanding_amount : 0,
                    total_revenue: registration.total_fee - registration.total_outstanding_amount,
                    total_deregistered_members: deregistered_on ? 1 : 0,
                    total_registration_pending_revenue: registration?.deregistered === false ? registration.total_outstanding_amount : 0,
                    total_registration_revenue: registration.total_fee - registration.total_outstanding_amount
                };
                report.data.push(newEntry);
            }
        }

        report.total_revenue += registration.total_fee - registration.total_outstanding_amount;
        report.total_registration_revenue += registration.total_fee - registration.total_outstanding_amount;

        report.total_pending_revenue += registration?.deregistered === false ? registration.total_outstanding_amount : 0;
        report.total_registration_pending_revenue += registration?.deregistered === false ? registration.total_outstanding_amount : 0;
    });

    return report;
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        let monthly_reports: Record<string, any>[] = [];

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

        if (query_string_params?.season_cycle) {
            if (!query_string_params.club_account_id) {
                return createResponse(400, { message: "club_account_id is required." }, origin);
            }

            const s3Key = `${query_string_params.club_account_id}/Season_${query_string_params.season_cycle}/Registrations.json`;

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
                const registrations = Array.isArray(s3Data) ? s3Data : [];
                report = processRegistrations(report, registrations);
            } catch (err: any) {
                const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
                if (status === 404) {
                    return createResponse(404, { message: "Reporting data not found for the specified season." }, origin);
                }
                console.error(`Error fetching S3 object ${s3Key}:`, err);
                throw err;
            }
        } else {
            const registrations = await queryItems(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id },
                process.env.REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX
            );
            report = processRegistrations(report, registrations ?? []);

        }

        return createResponse(200, report ?? {}, origin);

    } catch (error: any) {
        console.error('General reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
