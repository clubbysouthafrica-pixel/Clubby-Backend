import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

function createBlankReport(report: any[], allFields: any) {
    allFields.forEach((field: Record<string, any>) => {
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
                    option_order_id: option.option_order_id,
                    row_name: option.label,
                    fee_amount: option.amount,
                    total: { paid_to_club: 0, due_to_club: 0, total: 0, pending: 0 },
                    data: []
                }))
            });
        }
    });
}

function updateReportWithNewRegistration(report: any[], registration: Record<string, any>) {
    const date = new Date(registration.registration_submitted_on);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year_month = `${year}/${month}`;

    report.forEach(field => {
        Object.keys(registration).forEach(key => {
            if (key.includes(field.field_id)) {
                if (field.rows) {

                    field.rows.forEach((row: Record<string, any>) => {
                        if (registration[key].option_order_id === row.option_order_id) {

                            row.total.due_to_club += row.fee_amount
                            row.total.pending += 1

                            let index = row.data.findIndex((item: any) => item.date === year_month);
                            if (index < 0) row.data.push({ date: year_month, paid_to_club: 0, due_to_club: row.fee_amount, total: 0, pending: 1 })
                            else {
                                row.data[index].due_to_club += row.fee_amount
                                row.data[index].pending += 1
                            }
                        }
                    })

                } else {

                    field.total.pending += 1
                    field.total.due_to_club += field.fee_amount

                    let index = field.data.findIndex((item: any) => item.date === year_month);
                    if (index < 0) field.data.push({ date: year_month, paid_to_club: 0, due_to_club: field.fee_amount, total: 0, pending: 1 })
                    else {
                        field.data[index].due_to_club += field.fee_amount
                        field.data[index].pending += 1
                    }

                }

            }

        })
    })
    console.log('REGISTRATION REPORT: ', JSON.stringify(report))
}

function updateReportWithPaidRegistration(report: any[], registration: Record<string, any>) {
    const registered_on_date = new Date(registration.registered_on);
    const registered_on_year = registered_on_date.getFullYear();
    const registered_on_month = String(registered_on_date.getMonth() + 1).padStart(2, '0');
    const registered_on_year_month = `${registered_on_year}/${registered_on_month}`;

    for (const field of report) {

        for (const key of Object.keys(registration)) {

            if (key.includes(field.field_id)) {

                if (field.rows) {

                    field.rows.forEach((row: Record<string, any>) => {
                        if (registration[key].option_order_id === row.option_order_id) {

                            row.total.paid_to_club += row.fee_amount
                            row.total.total += 1

                            let index = row.data.findIndex((item: any) => item.date === registered_on_year_month);
                            if (index < 0) row.data.push({ date: registered_on_year_month, paid_to_club: row.fee_amount, due_to_club: 0, total: 1, pending: 0 })
                            else {
                                row.data[index].paid_to_club += row.fee_amount
                                row.data[index].total += 1
                            }
                        }
                    })

                } else {
                    field.total.total += 1
                    field.total.paid_to_club += field.fee_amount

                    let index = field.data.findIndex((item: any) => item.date === registered_on_year_month);
                    if (index < 0) {
                        field.data.push({ date: registered_on_year_month, paid_to_club: field.fee_amount, due_to_club: 0, total: 1, pending: 0 })
                    }
                    else {
                        field.data[index].paid_to_club += field.fee_amount
                        field.data[index].total += 1
                    }
                }

            }

        }
    }
    console.log('REGISTRATION REPORT: ', JSON.stringify(report))
}

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const fields = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        )

        if (!fields) {
            return createResponse(200, { report: [] }, origin)
        }

        const report: any[] = [];

        createBlankReport(report, fields)

        const registrations = await queryItems(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX
        )

        if (!registrations) {
            return createResponse(200, { report }, origin);
        }

        for (const registration of registrations) {
            if (registration?.last_season_registration) continue
            if (registration.total_outstanding_amount == 0) {
                updateReportWithPaidRegistration(report, registration)
            } else {
                updateReportWithNewRegistration(report, registration)
            }
        }

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
