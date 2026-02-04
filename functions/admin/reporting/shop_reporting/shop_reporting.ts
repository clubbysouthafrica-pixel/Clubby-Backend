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

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        let orders: any = null;

        if (query_string_params?.season_cycle) {
            if (!query_string_params.club_account_id) {
                return createResponse(400, { message: "club_account_id is required." }, origin);
            }

            const s3Key = `${query_string_params.club_account_id}/Season_${query_string_params.season_cycle}/Orders.json`;

            try {
                const s3ObjectOrders = await s3_client.send(
                    new GetObjectCommand({
                        Bucket: process.env.CLUB_HISTORY_BUCKET_NAME as string,
                        Key: s3Key,
                    })
                );
                const bodyContentsOrders = await s3ObjectOrders.Body?.transformToString();
                const s3DataOrders = JSON.parse(bodyContentsOrders || '{}');
                orders = Array.isArray(s3DataOrders) ? s3DataOrders : [];

            } catch (err: any) {
                const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
                if (status === 404) {
                    return createResponse(404, { message: "Orders data not found for the specified season." }, origin);
                }
                console.error(`Error fetching S3 object:`, err);
                throw err;
            }
        } else {
            orders = await queryItems(
                process.env.ORDERS_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id }
            )
        }

        const report: any[] = [];

        for (const order of orders) {
            if (order?.items && order.items.length > 0) {

                for (const item of order.items) {
                    let existingEntry = report.find((entry: Record<string, any>) => item.product_id === entry.product_id);

                    if (order.order_confirmed_by_admin) {
                        if (!existingEntry) {
                            existingEntry = {
                                product_id: item.product_id,
                                product_name: item.name,
                                total_revenue: item?.subtotal ?? 0,
                                total_pending_revenue: 0,
                                total_sold_units: item?.quantity ?? 0,
                                total_pending_units: 0,
                                data: [
                                    {
                                        date: formatToYearMonth(order.order_confirmed_by_admin_timestamp),
                                        revenue: item?.subtotal ?? 0,
                                        sold_units: item?.quantity ?? 0,
                                        pending_revenue: 0,
                                        pending_units: 0
                                    }
                                ]
                            };
                            report.push(existingEntry);
                        } else {
                            let existingDateData = existingEntry.data.find((entry: Record<string, any>) => formatToYearMonth(order.order_confirmed_by_admin_timestamp) === entry.date);

                            if (!existingDateData) {
                                existingDateData = {
                                    date: formatToYearMonth(order.order_confirmed_by_admin_timestamp),
                                    revenue: item?.subtotal ?? 0,
                                    sold_units: item?.quantity ?? 0,
                                    pending_revenue: 0,
                                    pending_units: 0
                                };
                                existingEntry.data.push(existingDateData);
                            } else {
                                existingDateData.revenue += item?.subtotal ?? 0;
                                existingDateData.sold_units += item?.quantity ?? 0;
                            }

                            existingEntry.total_revenue += item?.subtotal ?? 0;
                            existingEntry.total_sold_units += item?.quantity ?? 0;
                        }
                    } else {
                        if (!existingEntry) {
                            existingEntry = {
                                product_id: item.product_id,
                                product_name: item.name,
                                total_revenue: 0,
                                total_pending_revenue: item?.subtotal ?? 0,
                                total_sold_units: 0,
                                total_pending_units: item?.quantity ?? 0,
                                data: [
                                    {
                                        date: formatToYearMonth(order.created_date),
                                        revenue: 0,
                                        sold_units: 0,
                                        pending_revenue: item?.subtotal ?? 0,
                                        pending_units: item?.quantity ?? 0
                                    }
                                ]
                            };
                            report.push(existingEntry);
                        } else {
                            let existingDateData = existingEntry.data.find((entry: Record<string, any>) => formatToYearMonth(order.created_date) === entry.date);

                            if (!existingDateData) {
                                existingDateData = {
                                    date: formatToYearMonth(order.created_date),
                                    revenue: 0,
                                    sold_units: 0,
                                    pending_revenue: item?.subtotal ?? 0,
                                    pending_units: item?.quantity ?? 0
                                };
                                existingEntry.data.push(existingDateData);
                            } else {
                                existingDateData.pending_revenue += item?.subtotal ?? 0;
                                existingDateData.pending_units += item?.quantity ?? 0;
                            }

                            existingEntry.total_pending_revenue += item?.subtotal ?? 0;
                            existingEntry.total_pending_units += item?.quantity ?? 0;
                        }
                    }

                }
            }
        }


        report.forEach(field => {
            if (field.data && Array.isArray(field.data)) {
                field.data.sort((a: Record<string, any>, b: Record<string, any>) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return dateA.getTime() - dateB.getTime();
                });
            }
            if (field.rows && Array.isArray(field.rows)) {
                field.rows.forEach((row: Record<string, any>) => {
                    if (row.data && Array.isArray(row.data)) {
                        row.data.sort((a: Record<string, any>, b: Record<string, any>) => {
                            const dateA = new Date(a.date);
                            const dateB = new Date(b.date);
                            return dateA.getTime() - dateB.getTime();
                        });
                    }
                });
            }
        });

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Registration fees reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
