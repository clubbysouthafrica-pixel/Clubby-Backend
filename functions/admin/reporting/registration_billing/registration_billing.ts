import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            undefined,
            false,
        );

        const registrations = await queryItems(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX
        )

        if (!form) {
            return createResponse(200, { report: [] }, origin);
        }

        const items = form.map(item => {
            const set = unmarshall(item);
            delete set.club_account_id;

            if (item.field_type.S === "STANDARD" && item.input_type.S === "DROPDOWN") {
                set.options = item.options.L.map((o: { S: string }) => o.S);
            }

            return set;
        });

        const report: any[] = [];

        items.forEach(field => {
            if (field.field_type !== "BILLING") return;

            if (field.input_type === "TEXT") {
                report.push({
                    table_name: field.field_name,
                    field_id: field.field_id,
                    fee_amount: field.amount,
                    total: { paid_to_club: 0, due_to_club: 0, total: 0, pending: 0 },
                    data: []
                });
            } else if (field.input_type === "DROPDOWN") {
                report.push({
                    table_name: field.field_name,
                    field_id: field.field_id,
                    rows: field.billingOptions.map((option: any) => ({
                        row_name: option.label,
                        total: { fee_amount: option.amount, paid_to_club: 0, due_to_club: 0, total: 0, pending: 0 },
                        data: []
                    }))
                });
            }
        });

        if (!registrations) {
            return createResponse(200, { report }, origin);
        }

        report.forEach(field => {
            registrations.forEach(registration => {
                
                if (registration.total_outstanding_amount == 0) {
                    const date = new Date(registration.registered_on);
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year_month = `${year}/${month}`;   

                    Object.keys(registration).forEach(key => {
                        if (key.includes(field.field_id)) {

                            if (field.rows) {

                                field.rows.forEach((row: any) => {
                                    row.total.paid_to_club += row.total.fee_amount
                                    row.total.total += 1

                                    let index = row.data.findIndex((item: any) => item.date === year_month);

                                    if (index < 0) row.data.push({date: year_month, paid_to_club: field.fee_amount, due_to_club: 0, total: 1, pending: 0})
                                    else {
                                        row.data[index].paid_to_club += row.total.fee_amount
                                        row.data[index].total += 1
                                    }
                                })

                            } else {

                                field.total.paid_to_club += field.fee_amount
                                field.total.total += 1

                                let index = field.data.findIndex((item: any) => item.date === year_month);
                                
                                if (index < 0) field.data.push({date: year_month, paid_to_club: field.fee_amount, due_to_club: 0, total: 1, pending: 0})
                                else {
                                    field.data[index].paid_to_club += field.fee_amount
                                    field.data[index].total += 1
                                }
                            }

                        }
                    })

                } else {

                    console.log('true')

                }

            })
        })

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
