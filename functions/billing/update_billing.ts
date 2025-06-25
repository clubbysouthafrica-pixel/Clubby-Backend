import { getItem } from "./function_helpers";

const REGISTRATION_FEE_TYPE = 'USER_REGISTRATION';

function isRegistrationFee(body: any): boolean {
    if (body.feeType == null || typeof body.feeType !== 'string' || body.feeType !== 'REGISTRATION')
}

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);

    try {

        for (const record of event.Records) {
            const body = record.body;
            
            if (body?.club_account_id == null || typeof body.club_account_id !== 'string') {

                // Send to failure queue
                return {
                    message: "Invalid body provided."
                }
            }


        }

        return {
            message: "Pass"
        }

    } catch (error: any) {

        console.log('Error: ', error)
        // Send to failure queue
        return {
            message: error
        }
    }
};
