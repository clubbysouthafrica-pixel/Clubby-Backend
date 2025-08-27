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

        const items = form.map(item => {
            const set = unmarshall(item);
            delete set.club_account_id;

            if (item.field_type.S === "STANDARD" && item.input_type.S === "DROPDOWN") {
                set.options = item.options.L.map((o: { S: string }) => o.S);
            }

            return set;
        });

        // Build initial report
        const report: any[] = [];

        items.forEach(field => {
            if (field.field_type !== "BILLING") return;

            if (field.input_type === "TEXT") {
                report.push({
                    table_name: field.field_name,
                    field_id: field.field_id,
                    fee_amount: field.amount,
                    data: { total: { paid_to_club: 0, due_to_club: 0 } }
                });
            } else if (field.input_type === "DROPDOWN") {
                report.push({
                    table_name: field.field_name,
                    field_id: field.field_id,
                    rows: field.billingOptions.map((option: any) => ({
                        row_name: option.label,
                        data: { total: { fee_amount: option.amount, paid_to_club: 0, due_to_club: 0 } }
                    }))
                });
            }
        });

        if (!club_members) {
            return createResponse(200, { report }, origin);
        }

        // Process each member
        club_members.forEach(member => {
            const year_month = (member.registered ? member.registered_on : member.registration_submitted_on).slice(0, 7);
            let outstanding_amount = member.outstanding_amount;

            Object.keys(member).forEach(key => {
                report.forEach((table: any) => {
                    if (`reg_field_${table.field_id}` !== key) return;

                    // TEXT fields
                    if (table.fee_amount !== undefined) {
                        // Monthly bucket
                        if (!table.data![year_month]) table.data![year_month] = { paid_to_club: 0, due_to_club: 0 };
                        // Total bucket
                        if (!table.data!["total"]) table.data!["total"] = { paid_to_club: 0, due_to_club: 0 };

                        const fee = table.fee_amount;
                        if (member.registered) {
                            table.data![year_month].paid_to_club += fee;
                            table.data!["total"].paid_to_club += fee;
                        } else {
                            if (outstanding_amount < fee) {
                                table.data![year_month].due_to_club += outstanding_amount;
                                table.data![year_month].paid_to_club += fee - outstanding_amount;
                                table.data!["total"].due_to_club += outstanding_amount;
                                table.data!["total"].paid_to_club += fee - outstanding_amount;
                                outstanding_amount = 0;
                            } else {
                                table.data![year_month].due_to_club += fee;
                                table.data!["total"].due_to_club += fee;
                                outstanding_amount -= fee;
                            }
                        }
                    }

                    // DROPDOWN fields
                    if (table.rows) {
                        table.rows.forEach((row: any) => {
                            if (row.row_name !== member[key].value) return;

                            // Monthly bucket
                            if (!row.data[year_month]) {
                                row.data[year_month] = {
                                    fee_amount: row.data.total.fee_amount,
                                    paid_to_club: 0,
                                    due_to_club: 0
                                };
                            }
                            // Total bucket
                            if (!row.data["total"]) {
                                row.data["total"] = {
                                    fee_amount: row.data.total.fee_amount,
                                    paid_to_club: 0,
                                    due_to_club: 0
                                };
                            }

                            const fee = row.data.total.fee_amount;
                            if (member.registered) {
                                row.data[year_month].paid_to_club += fee;
                                row.data["total"].paid_to_club += fee;
                            } else {
                                if (outstanding_amount < fee) {
                                    row.data[year_month].due_to_club += outstanding_amount;
                                    row.data[year_month].paid_to_club += fee - outstanding_amount;
                                    row.data["total"].due_to_club += outstanding_amount;
                                    row.data["total"].paid_to_club += fee - outstanding_amount;
                                    outstanding_amount = 0;
                                } else {
                                    row.data[year_month].due_to_club += fee;
                                    row.data["total"].due_to_club += fee;
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
