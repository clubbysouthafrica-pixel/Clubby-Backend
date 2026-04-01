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

const processOrders = (report: Record<string, any>, orders: Record<string, any>[]) => {
    if (!Array.isArray(report.order_data)) {
        report.order_data = [];
    }

    if (!Array.isArray(report.data)) {
        report.data = [];
    }

    orders.forEach(order => {
        if (order?.payment_status === "REFUND") return;
        
        report.total_shop_revenue += order.amount_paid;
        report.total_revenue += order.amount_paid;

        if (!order.order_confirmed_by_admin) {
            report.total_shop_pending_revenue += order.total_amount - order.amount_paid;
            report.total_pending_revenue += order.total_amount - order.amount_paid;
        }

        report.total_shop_sold_items += order.order_confirmed_by_admin ? 1 : 0;
        report.total_shop_pending_sold_items += order.order_confirmed_by_admin ? 0 : 1;

        const order_created_date = formatToYearMonth(order.created_date);
        const order_confirmed_date = formatToYearMonth(order.order_confirmed_by_admin_timestamp);

        let existingCreatedEntry = report.order_data.find((entry: Record<string, any>) => entry.date === order_created_date);
        let existingConfirmedEntry = report.order_data.find((entry: Record<string, any>) => entry.date === order_confirmed_date);

        let existingDataCreatedEntry = report.data.find((entry: Record<string, any>) => entry.date === order_created_date);
        let existingDataConfirmedEntry = report.data.find((entry: Record<string, any>) => entry.date === order_confirmed_date);

        if (order.order_confirmed_by_admin) {
            if (existingConfirmedEntry) {
                existingConfirmedEntry.total_revenue = (existingConfirmedEntry.total_revenue || 0) + order.amount_paid;
                existingConfirmedEntry.total_shop_sold_items = (existingConfirmedEntry.total_shop_sold_items || 0) + 1;
            } else {
                const newConfirmedEntry: Record<string, any> = {
                    date: order_confirmed_date,
                    total_revenue: order.amount_paid,
                    total_pending_revenue: 0,
                    total_shop_sold_items: 1,
                    total_shop_pending_sold_items: 0
                };
                report.order_data.push(newConfirmedEntry);
            }

            if (existingDataConfirmedEntry) {
                existingDataConfirmedEntry.total_revenue = (existingDataConfirmedEntry.total_revenue || 0) + order.amount_paid;
            } else {
                const newDataConfirmedEntry: Record<string, any> = {
                    date: order_confirmed_date,
                    total_revenue: order.amount_paid,
                    total_pending_revenue: 0
                };
                report.data.push(newDataConfirmedEntry);
            }
        } else {
            if (existingCreatedEntry) {
                existingCreatedEntry.total_pending_revenue = (existingCreatedEntry.total_pending_revenue || 0) + (order.total_amount - order.amount_paid);
                existingCreatedEntry.total_shop_pending_sold_items = (existingCreatedEntry.total_shop_pending_sold_items || 0) + 1;
            } else {
                const newCreatedEntry: Record<string, any> = {
                    date: order_created_date,
                    total_pending_revenue: order.total_amount - order.amount_paid,
                    total_shop_pending_sold_items: 1,
                    total_shop_sold_items: 0,
                    total_revenue: 0
                };
                report.order_data.push(newCreatedEntry);
            }

            if (existingDataCreatedEntry) {
                existingDataCreatedEntry.total_pending_revenue = (existingDataCreatedEntry.total_pending_revenue || 0) + (order.total_amount - order.amount_paid);
            } else {
                const newDataCreatedEntry: Record<string, any> = {
                    date: order_created_date,
                    total_revenue: 0,
                    total_pending_revenue: order.total_amount - order.amount_paid
                };
                report.data.push(newDataCreatedEntry);
            }
        }

    });

    return report;
}

const processRegistrations = (report: Record<string, any>, registrations: Record<string, any>[]) => {
    if (!Array.isArray(report.registration_data)) {
        report.registration_data = [];
    }

    if (!Array.isArray(report.data)) {
        report.data = [];
    }

    registrations.forEach(registration => {
        if (registration?.last_season_registration === true) {
            return;
        }

        if (registration.deregistered === true) {
            report.total_deregistered_members += 1;
        } else if (registration?.registered_on) {
            report.total_active_members += 1;
            report.total_registered_members += 1;
        } else {
            report.total_pending_members += 1;
        }

        const registration_submission_date = registration?.registration_submitted_on ? formatToYearMonth(registration.registration_submitted_on) : undefined;
        const registered_on_date = registration?.registered_on ? formatToYearMonth(registration.registered_on) : undefined;
        const deregistered_on = registration?.deregistered_on ? formatToYearMonth(registration.deregistered_on) : undefined;

        if (registration_submission_date) {
            let existingEntry = report.registration_data.find((entry: Record<string, any>) => entry.date === registration_submission_date);
            let existingDataEntry = report.data.find((entry: Record<string, any>) => entry.date === registration_submission_date);

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
                report.registration_data.push(newEntry);
            }

            if (existingDataEntry) {
                existingDataEntry.total_revenue = (existingDataEntry.total_revenue || 0) + (registration.total_fee - registration.total_outstanding_amount);
                existingDataEntry.total_pending_revenue = (existingDataEntry.total_pending_revenue || 0) + (registration?.deregistered === false ? registration.total_outstanding_amount : 0);
            } else {
                const newDataEntry: Record<string, any> = {
                    date: registration_submission_date,
                    total_revenue: registration.total_fee - registration.total_outstanding_amount,
                    total_pending_revenue: registration?.deregistered === false ? registration.total_outstanding_amount : 0
                };
                report.data.push(newDataEntry);
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
        let report: Record<string, any> = {
            total_active_members: 0,
            total_registered_members: 0,
            total_pending_members: 0,
            total_pending_revenue: 0,
            total_revenue: 0,
            total_deregistered_members: 0,
            total_registration_pending_revenue: 0,
            total_registration_revenue: 0,
            total_shop_revenue: 0,
            total_shop_pending_revenue: 0,
            total_shop_sold_items: 0,
            total_shop_pending_sold_items: 0,
            data: [],
            registration_data: [],
            order_data: []
        };

        if (query_string_params?.season_cycle && query_string_params?.season_cycle !== "1") {
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

        if (query_string_params?.season_cycle) {
            if (!query_string_params.club_account_id) {
                return createResponse(400, { message: "club_account_id is required." }, origin);
            }

            const s3Key = `${query_string_params.club_account_id}/Season_${query_string_params.season_cycle}/Orders.json`;

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
                const orders = Array.isArray(s3Data) ? s3Data : [];
                report = processOrders(report, orders);
            } catch (err: any) {
                const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
                if (status === 404) {
                    return createResponse(404, { message: "Reporting data not found for the specified season." }, origin);
                }
                console.error(`Error fetching S3 object ${s3Key}:`, err);
                throw err;
            }
        } else {
            const orders = await queryItems(
                process.env.ORDERS_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id }
            );
            report = processOrders(report, orders ?? []);

        }

        if (report.registration_data && Array.isArray(report.registration_data)) {
            report.registration_data.sort((a: Record<string, any>, b: Record<string, any>) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateA.getTime() - dateB.getTime();
            });
        }

        return createResponse(200, report ?? {}, origin);

    } catch (error: any) {
        console.error('General reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
