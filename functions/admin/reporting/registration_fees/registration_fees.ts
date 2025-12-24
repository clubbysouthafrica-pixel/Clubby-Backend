import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3_client = new S3Client({ region: process.env.REGION });

function createBlankReport(report: any[], allFields: any) {
    allFields.forEach((field: Record<string, any>) => {
        if (field.field_type !== "BILLING" || !field.visible) return;

        if (field.input_type === "TEXT") {
            report.push({
                old_field: !field.visible,
                table_name: field.field_name,
                field_id: field.field_id,
                fee_amount: field.amount,
                total: { paid_to_club: 0, due_to_club: 0, total: 0, pending: 0 },
                data: []
            });
        } else if (field.input_type === "DROPDOWN") {
            report.push({
                old_field: !field.visible,
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
        } else if (field.input_type === "NUMBER") {
            report.push({
                old_field: !field.visible,
                table_name: field.field_name,
                field_id: field.field_id,
                fee_amount: null,
                total: { paid_to_club: 0, due_to_club: 0, total: 0, pending: 0 },
                data: []
            });
        }
    });
}

function updateReportWithNewRegistration(report: any[], registration: Record<string, any>) {
    const date = new Date(registration.registration_submitted_on);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year_month = `${year}/${month}`;

    console.log('Processing new registration:', registration.registration_id);
    report.forEach(field => {

        Object.keys(registration).forEach(key => {
            if (key.includes(field.field_id)) {
                if (field.rows) {

                    let row_found  = false;
                    field.rows.forEach((row: Record<string, any>) => {
                        if (registration[key].option_order_id === row.option_order_id) {

                            row.total.due_to_club += registration[key].value
                            row.total.pending += registration[key].multiplier_value ?? 1

                            let index = row.data.findIndex((item: any) => item.date === year_month);
                            if (index < 0) row.data.push({ date: year_month, paid_to_club: 0, due_to_club: registration[key].value, total: 0, pending: registration[key].multiplier_value ?? 1 })
                            else {
                                row.data[index].due_to_club += registration[key].value
                                row.data[index].pending += registration[key].multiplier_value ?? 1
                            }
                            row_found  = true;
                        }
                    })

                    if (!row_found) {
                        field.rows.push({
                            old_option: true,
                            option_order_id: registration[key].option_order_id,
                            row_name: registration[key].label_value,
                            fee_amount: registration[key].value,
                            total: { paid_to_club: 0, due_to_club: registration[key].value, total: 0, pending: registration[key].multiplier_value ?? 1 },
                            data: [{ date: year_month, paid_to_club: 0, due_to_club: registration[key].value, total: 0, pending: registration[key].multiplier_value ?? 1 }]
                        })
                    }

                } else {

                    field.total.pending += registration[key].multiplier_value ?? 1
                    field.total.due_to_club += registration[key].value

                    let index = field.data.findIndex((item: any) => item.date === year_month);
                    if (index < 0) field.data.push({ date: year_month, paid_to_club: 0, due_to_club: registration[key].value, total: 0, pending: registration[key].multiplier_value ?? 1 })
                    else {
                        field.data[index].due_to_club += registration[key].value
                        field.data[index].pending += registration[key].multiplier_value ?? 1
                    }
                }

            }

        })
    });

    console.log('Updated report for registration:', registration.registration_id);
    console.log('Current report state:', JSON.stringify(report));
}

function updateReportWithPaidRegistration(report: any[], registration: Record<string, any>) {
    const registered_on_date = new Date(registration.registered_on);
    const registered_on_year = registered_on_date.getFullYear();
    const registered_on_month = String(registered_on_date.getMonth() + 1).padStart(2, '0');
    const registered_on_year_month = `${registered_on_year}/${registered_on_month}`;

    console.log('Processing paid registration:', registration.registration_id);
    for (const field of report) {

        for (const key of Object.keys(registration)) {

            if (key.includes(field.field_id)) {

                if (field.rows) {

                    let row_found  = false;
                    field.rows.forEach((row: Record<string, any>) => {
                        if (registration[key].option_order_id === row.option_order_id) {

                            row.total.paid_to_club += registration[key].value
                            row.total.total += registration[key].multiplier_value ?? 1

                            let index = row.data.findIndex((item: any) => item.date === registered_on_year_month);
                            if (index < 0) row.data.push({ date: registered_on_year_month, paid_to_club: registration[key].value, due_to_club: 0, total: registration[key].multiplier_value ?? 1, pending: 0 })
                            else {
                                row.data[index].paid_to_club += registration[key].value
                                row.data[index].total += registration[key].multiplier_value ?? 1
                            }
                            row_found  = true;
                        }
                    })

                    if (!row_found) {
                        field.rows.push({
                            old_field: true,
                            option_order_id: registration[key].option_order_id,
                            row_name: registration[key].label_value,
                            fee_amount: registration[key].value,
                            total: { paid_to_club: 0, due_to_club: registration[key].value, total: 0, pending: registration[key].multiplier_value ?? 1 },
                            data: [{ date: registered_on_year_month, paid_to_club: 0, due_to_club: registration[key].value, total: 0, pending: registration[key].multiplier_value ?? 1 }]
                        })
                    }

                } else {
                    field.total.total += registration[key].multiplier_value ?? 1
                    field.total.paid_to_club += registration[key].value

                    let index = field.data.findIndex((item: any) => item.date === registered_on_year_month);
                    if (index < 0) {
                        field.data.push({ date: registered_on_year_month, paid_to_club: registration[key].value, due_to_club: 0, total: registration[key].multiplier_value ?? 1, pending: 0 })
                    }
                    else {
                        field.data[index].paid_to_club += registration[key].value
                        field.data[index].total += registration[key].multiplier_value ?? 1
                    }
                }

            }

        }
    }
    console.log('Updated report for registration:', registration.registration_id);
    console.log('Current report state:', JSON.stringify(report));
}

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        let fields: any = null;
        let registrations: any = null;

        if (query_string_params?.season_cycle) {
            if (!query_string_params.club_account_id) {
                return createResponse(400, { message: "club_account_id is required." }, origin);
            }

            const s3Key = `${query_string_params.club_account_id}/Season_${query_string_params.season_cycle}/Registrations.json`;

            try {
                const s3Object = await s3_client.send(
                    new GetObjectCommand({
                        Bucket: process.env.CLUB_HISTORY_BUCKET_NAME as string,
                        Key: s3Key,
                    })
                );

                const bodyContents = await s3Object.Body?.transformToString();
                const s3Data = JSON.parse(bodyContents || '{}');
                
                registrations = Array.isArray(s3Data) ? s3Data : [];

                fields = await queryItems(
                    process.env.REGISTRATION_FORM_TABLE_NAME as string,
                    "club_account_id = :clubId",
                    { ":clubId": query_string_params.club_account_id }
                )

            } catch (err: any) {
                const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
                if (status === 404) {
                    return createResponse(404, { message: "Registration fees data not found for the specified season." }, origin);
                }
                console.error(`Error fetching S3 object ${s3Key}:`, err);
                throw err;
            }
        } else {
            fields = await queryItems(
                process.env.REGISTRATION_FORM_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id }
            )

            registrations = await queryItems(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id },
                process.env.REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX
            )
        }

        if (!fields) {
            return createResponse(200, { report: [] }, origin)
        }

        const report: any[] = [];

        createBlankReport(report, fields)

        if (!registrations) {
            return createResponse(200, { report }, origin);
        }

        for (const registration of registrations) {
            if (registration?.last_season_registration) continue
            if (registration.total_outstanding_amount == 0) {
                updateReportWithPaidRegistration(report, registration)
            } else if (registration?.deregistered !== true) {
                updateReportWithNewRegistration(report, registration)
            }
        }
        console.log('REGISTRATION REPORT: ', JSON.stringify(report))

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Registration fees reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
