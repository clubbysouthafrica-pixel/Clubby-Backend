import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        );

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            undefined,
            false,
        );
        if (!form) {
            return createResponse(500, { message: "Registration form does not exist for club." }, origin);
        }

        const items: any[] = [];
        form.forEach((item) => {

            const set = unmarshall(item);
            delete set.club_account_id;

            if (item.field_type.S === "STANDARD" && item.input_type.S === "DROPDOWN") {
                set["options"] = item.options.L.map((item: { S: string }) => item.S);
            }

            items.push(set as any);
        });


        const report: any = [];
        items.forEach(field => {
            if (field.input_type === "DROPDOWN" && field.field_type === "BILLING") {
                const entry = {
                    table_name: field.field_name,
                    field_id: field.field_id,
                    report_type: "DROPDOWN",
                    rows: []
                } as any;

                field.billingOptions.forEach((option: any) => {
                    const row: any = {}
                    row.row_name = option.label
                    row.data = {
                        fee_amount: option.amount,
                        paid_to_club: 0,
                        due_to_club: 0
                    }
                    entry.rows.push(row)
                })
                report.push(entry);
            } else if (field.input_type === "TEXT" && field.field_type === "BILLING") {
                const entry = {
                    table_name: field.field_name,
                    field_id: field.field_id,
                    report_type: "TEXT",
                    fee_amount: field.amount,
                    paid_to_club: 0,
                    due_to_club: 0
                } as any;
                report.push(entry);
            }
        });

        if (!club_members) {
            return createResponse(200, { report }, origin);
        }

        club_members.forEach(member => {

            if (member.registered) {

                Object.keys(member).forEach(key => {

                    report.forEach((table: any) => {

                        if (`reg_field_${table.field_id}` === key) {

                            if (table.report_type === "TEXT") {
                                table.paid_to_club += table.fee_amount
                            } else {
                                table.rows.forEach((row: any) => {
                                    if (row.row_name === member[key].value) {
                                        row.data.paid_to_club += row.data.fee_amount
                                    }
                                })
                            }

                        }
                    })
                })
            } else {
                let outstanding_amount = member.outstanding_amount;
                Object.keys(member).forEach(key => {

                    report.forEach((table: any) => {
                        if (`reg_field_${table.field_id}` === key) {

                            if (table.report_type === "TEXT") {
                                if (outstanding_amount < table.fee_amount) {
                                    table.due_to_club += outstanding_amount
                                    table.paid_to_club += table.fee_amount - outstanding_amount
                                    outstanding_amount = 0
                                } else {
                                    table.due_to_club += table.fee_amount
                                    outstanding_amount = outstanding_amount - table.fee_amount
                                }
                            } else {
                                table.rows.forEach((row: any) => {
                                    if (row.row_name === member[key].value) {
                                        if (outstanding_amount < row.data.fee_amount) {
                                            row.data.due_to_club += outstanding_amount
                                            row.data.paid_to_club += row.data.fee_amount - outstanding_amount
                                            outstanding_amount = 0
                                        } else {
                                            row.data.due_to_club += row.data.fee_amount
                                            outstanding_amount = outstanding_amount - row.data.fee_amount
                                        }
                                    }
                                })
                            }
                        }
                    })
                })
            }
        });

        report.forEach((r: any) => delete r.report_type);

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
