import {
    addItem,
    getItem,
    queryItems,
    updateItem
} from "./function_helpers";

async function updateRegistrationReportWithNewRegistration(registration_report: Record<string, any>[], registration: Record<string, any>) {
    const date = new Date(registration.registration_submitted_on);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year_month = `${year}/${month}`;

    registration_report.forEach(field => {
        Object.keys(registration).forEach(key => {
            if (key.includes(field.field_id)) {
                if (field.rows) {

                    field.rows.forEach((row: Record<string, any>) => {
                        if (registration[key].option_order_id === row.option_order_id) {

                            row.total.due_to_club += row.total.fee_amount
                            row.total.pending += 1

                            let index = row.data.findIndex((item: any) => item.date === year_month);
                            if (index < 0) row.data.push({ date: year_month, paid_to_club: 0, due_to_club: row.total.fee_amount, total: 0, pending: 1 })
                            else {
                                row.data[index].due_to_club += row.total.fee_amount
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

    console.log('REGISTRATION REPORT: ', JSON.stringify(registration_report))

    for (const r of registration_report) {
        await addItem(process.env.REGISTRATION_REPORTING_TABLE_NAME as string, r)
    }
}

async function updateRegistrationReportWithPaidAmount(registration_report: Record<string, any>[], registration: Record<string, any>) {
    if (registration.total_outstanding_amount != 0) {
        return
    }
    let amount_paid = registration.total_fee - registration.total_outstanding_amount

    const registered_on_date = new Date(registration.registered_on);
    const registered_on_year = registered_on_date.getFullYear();
    const registered_on_month = String(registered_on_date.getMonth() + 1).padStart(2, '0');
    const registered_on_year_month = `${registered_on_year}/${registered_on_month}`;

    const registration_submitted_on_date = new Date(registration.registration_submitted_on);
    const registration_submitted_on_year = registration_submitted_on_date.getFullYear()
    const registration_submitted_on_month = String(registration_submitted_on_date.getMonth() + 1).padStart(2, '0');
    const registration_submitted_on_year_month = `${registration_submitted_on_year}/${registration_submitted_on_month}`;

    for (const field of registration_report) {

        for (const key of Object.keys(registration)) {

            if (key.includes(field.field_id)) {

                if (amount_paid >= registration[key].value) {

                    if (!registration[key]?.paid) {

                        if (field.rows) {

                            field.rows.forEach((row: Record<string, any>) => {
                                if (registration[key].option_order_id === row.option_order_id) {

                                    row.total.due_to_club -= row.fee_amount
                                    row.total.pending -= 1
                                    row.total.paid_to_club += row.fee_amount
                                    row.total.total += 1

                                    let index = row.data.findIndex((item: any) => item.date === registered_on_year_month);
                                    if (index < 0) row.data.push({ date: registered_on_year_month, paid_to_club: row.fee_amount, due_to_club: 0, total: 1, pending: 0 })
                                    else {
                                        row.data[index].paid_to_club += row.fee_amount
                                        row.data[index].total += 1
                                    }

                                    index = row.data.findIndex((item: any) => item.date === registration_submitted_on_year_month);
                                    row.data[index].due_to_club -= row.fee_amount
                                    row.data[index].pending -= 1
                                }
                            })

                        } else {
                            field.total.pending -= 1
                            field.total.total += 1
                            field.total.due_to_club -= field.fee_amount
                            field.total.paid_to_club += field.fee_amount

                            let index = field.data.findIndex((item: any) => item.date === registered_on_year_month);
                            if (index < 0) {
                                field.data.push({ date: registered_on_year_month, paid_to_club: field.fee_amount, due_to_club: 0, total: 1, pending: 0 })
                            }
                            else {
                                field.data[index].paid_to_club += field.fee_amount
                                field.data[index].total += 1
                            }

                            index = field.data.findIndex((item: any) => item.date === registration_submitted_on_year_month);
                            field.data[index].due_to_club -= field.fee_amount
                            field.data[index].pending -= 1
                        }

                        await updateItem(
                            process.env.REGISTRATIONS_TABLE_NAME as string,
                            {
                                user_id: registration.user_id,
                                registration_id: registration.registration_id
                            },
                            `SET #key.#paid = :paid`,
                            {
                                "#paid": "paid",
                                "#key": `${key}`
                            },
                            {
                                ":paid": true
                            }
                        )

                    } else amount_paid = amount_paid - registration[key].value

                }

            }

        }
    }

    console.log('REGISTRATION REPORT: ', JSON.stringify(registration_report))

    for (const r of registration_report) {
        await addItem(process.env.REGISTRATION_REPORTING_TABLE_NAME as string, r)
    }
}

export const handler = async (event: any) => {
    console.log("-------------------------------");
    console.log(`EVENT @ ${new Date()}: `, event);

    try {

        for (const record of event.Records) {
            const body = JSON.parse(record.body);

            const {
                registration_id,
                user_id,
                update_registration_reporting
            } = body;

            const registration = await getItem(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                {
                    user_id: user_id,
                    registration_id: registration_id
                }
            )
            if (!registration) {
                console.log('Registration does not exist.')
                return
            }

            const registration_report = await queryItems(
                process.env.REGISTRATION_REPORTING_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": registration.club_account_id },
            )
            if (!registration_report) {
                console.log('Registration report does not exist.')
                return
            }

            if (update_registration_reporting && update_registration_reporting === "true") {  
                // Member payment submitted
                await updateRegistrationReportWithPaidAmount(registration_report, registration)
            } else  {
                // The registration form has just been submitted - total amount due to club
                await updateRegistrationReportWithNewRegistration(registration_report, registration)
            }
        }

    } catch (error) {
        console.error("Error processing event:", error);
    }

    console.log("-------------------------------");
};
