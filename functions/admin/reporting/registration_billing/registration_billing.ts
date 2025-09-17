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
                    total: { paid_to_club: 0, due_to_club: 0 },
                    data: []
                });
            } else if (field.input_type === "DROPDOWN") {
                report.push({
                    table_name: field.field_name,
                    field_id: field.field_id,
                    rows: field.billingOptions.map((option: any) => ({
                        row_name: option.label,
                        total: { fee_amount: option.amount, paid_to_club: 0, due_to_club: 0 },
                        data: []
                    }))
                });
            }
        });

        if (!club_members) {
            return createResponse(200, { report }, origin);
        }

        club_members.forEach(member => {
            const year_month = (member.registered ? member.registered_on : member.registration_submitted_on).slice(0, 7);
            let outstanding_amount = member.outstanding_amount;

            Object.keys(member).forEach(key => {
                report.forEach((table: any) => {
                    if (`reg_field_${table.field_id}` !== key) return;

                    if (table.fee_amount !== undefined) {
                        let index = table.data.findIndex((item: any) => item.date === year_month);
                        if (index < 0) {
                            table.data.push({ date: year_month, paid_to_club: 0, due_to_club: 0 })
                            index = table.data.length - 1
                        }
                        
        
                        if (!table!["total"]) table!["total"] = { paid_to_club: 0, due_to_club: 0 };

                        const fee = table.fee_amount;
                        if (member.registered) {
                            table.data[index].paid_to_club += fee;
                            table!["total"].paid_to_club += fee;
                        } else {
                            if (outstanding_amount < fee) {
                                table.data[index].due_to_club += outstanding_amount;
                                table.data[index].paid_to_club += fee - outstanding_amount;
                                table!["total"].due_to_club += outstanding_amount;
                                table!["total"].paid_to_club += fee - outstanding_amount;
                                outstanding_amount = 0;
                            } else {
                                table.data[index].due_to_club += fee;
                                table!["total"].due_to_club += fee;
                                outstanding_amount -= fee;
                            }
                        }
                    }

                    if (table.rows) {
                        table.rows.forEach((row: any) => {
                            if (row.row_name !== member[key].label_value) return;

                            let index = row.data.findIndex((item: any) => item.date === year_month);
                            if (index < 0) {
                                row.data.push({ date: year_month, paid_to_club: 0, due_to_club: 0 })
                                index = row.data.length - 1
                            }
   
                            if (!row["total"]) {
                                row["total"] = {
                                    fee_amount: row.total.fee_amount,
                                    paid_to_club: 0,
                                    due_to_club: 0
                                };
                            }

                            const fee = row.total.fee_amount;
                            if (member.registered) {
                                row.data[index].paid_to_club += fee;
                                row["total"].paid_to_club += fee;
                            } else {
                                if (outstanding_amount < fee) {
                                    row.data[index].due_to_club += outstanding_amount;
                                    row.data[index].paid_to_club += fee - outstanding_amount;
                                    row["total"].due_to_club += outstanding_amount;
                                    row["total"].paid_to_club += fee - outstanding_amount;
                                    outstanding_amount = 0;
                                } else {
                                    row.data[index].due_to_club += fee;
                                    row["total"].due_to_club += fee;
                                    outstanding_amount -= fee;
                                }
                            }
                        });
                    }
                });
            });
        });

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
