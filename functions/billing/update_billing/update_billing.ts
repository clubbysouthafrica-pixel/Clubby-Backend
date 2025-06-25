import { FEE_TYPES, getItem, addItem } from "./function_helpers";

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

            const body = JSON.parse(record.body);;

            if (body?.club_account_id == null || typeof body.club_account_id !== 'string') {

                // Send to failure queue
                console.log(`Invalid body provided for club ${body.club_account_id}.`)
            }

            if (isRegistrationFee(body)) {
                const club = await getItem(
                    process.env.BILLING_TABLE_NAME as string,
                    { club_account_id: body.club_account_id }
                );

                if (!club) {
                    
                    // Send to failure queue
                    console.log(`Club ${body.club_account_id} does not exist!`)
                } else {
                    club.total_registered_users = club.total_registered_users + 1
                    club.total_amount = club.total_amount + club.user_registration_fee
                    club.outstanding_amount = club.outstanding_amount + club.user_registration_fee

                    await addItem(
                        process.env.BILLING_TABLE_NAME as string,
                        club
                    );
                }
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
