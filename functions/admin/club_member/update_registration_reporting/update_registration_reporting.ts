import { addItem, getItem, queryItems } from "./function_helpers";

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
                        field.data[index].due_to_club += field.total.fee_amount
                        field.data[index].pending += 1
                    }

                }

            }

        })
    })

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
                payment_amount
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

            if (!payment_amount) { // This implies the registration form has just been submitted
                await updateRegistrationReportWithNewRegistration(registration_report, registration)
            }
        }

    } catch (error) {
        console.error("Error processing event:", error);
    }

    console.log("-------------------------------");
};
