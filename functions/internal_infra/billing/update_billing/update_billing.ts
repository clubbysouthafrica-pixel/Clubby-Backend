import { FEE_TYPES, getItem, addItem, updateItem } from "./function_helpers";

function isRegistrationFee(body: any): boolean {
    if (body.feeType == null || typeof body.feeType !== 'string' || body.feeType !== FEE_TYPES.USER_REGISTRATION) {
        return false
    }
    return true
}

export const handler = async (event: any) => {
    console.log("-------------------------------")
    console.log(`EVENT @ ${new Date()}: `, event);

    try {

        for (const record of event.Records) {

            const body = JSON.parse(record.body);

            if (body?.club_account_id == null || typeof body.club_account_id !== 'string') {

                // Send to failure queue
                console.log(`Invalid body provided for club ${body.club_account_id}.`)
            }

            const now = new Date();
            const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

            if (isRegistrationFee(body)) {
                await updateItem(
                    process.env.MONTHLY_BILLING_TABLE_NAME as string,
                    { 
                        club_account_id: body.club_account_id,
                        year_month: year_month,
                    },
                    `SET 
                        #total_registered_users = if_not_exists(#total_registered_users, :zero) + :one,
                        #total_amount = if_not_exists(#total_amount, :zero) + #user_registration_fee,
                        #outstanding_amount = if_not_exists(#outstanding_amount, :zero) + #user_registration_fee
                    `,
                    {
                        "#total_registered_users": "total_registered_users",
                        "#total_amount": "total_amount",
                        "#outstanding_amount": "outstanding_amount",
                        "#user_registration_fee": "user_registration_fee"
                    },
                    {
                        ":one": 1,
                        ":zero": 0
                    }
                )
            }

        }

        console.log("-------------------------------")
        return {
            message: "Pass"
        }

    } catch (error: any) {

        console.log('Error: ', error)
        // Send to failure queue
        console.log("-------------------------------")
        return {
            message: error
        }
    }
};
