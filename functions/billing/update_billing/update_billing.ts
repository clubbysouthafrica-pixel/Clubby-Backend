import { FEE_TYPES } from "./function_helpers";

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
                console.log("-------------------------------")
                return {
                    message: "Invalid body provided."
                }
            }

            if (isRegistrationFee(body)) {
                console.log('HERE')
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
