import {
    createResponse,
    deconstructEvent,
    getItem,
    queryItems,
    sendSqsMessage,
    updateItem
} from "./function_helpers";

const getTotalOutstanding = (monthly_billing: Record<string, any>[]) => {
    let total_outstanding_amount = 0;

    monthly_billing?.forEach(month => {
        total_outstanding_amount += month?.outstanding_amount ?? 0
    });

    return total_outstanding_amount;
};

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (body?.club_account_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id required in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                "club_account_id": body.club_account_id
            }
        )

        if (!club) {
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        const monthly_billing = await queryItems(
            process.env.MONTHLY_BILLING_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": body.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        );

        if (monthly_billing && getTotalOutstanding(monthly_billing) > 0) {
            return createResponse(410, { message: "Cannot deregister season while there are outstanding amounts." }, origin);
        }

        await updateItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                "club_account_id": body.club_account_id
            },
            `SET 
                #deregistration_in_progress = :true
            `,
            {
                "#deregistration_in_progress": "deregistration_in_progress"
            },
            {
                ":true": true
            }
        );

        await sendSqsMessage(
            process.env.DEREGISTRATION_QUEUE_URL as string,
            {
                club_account_id: body.club_account_id
            },
            "DEREGISTER_ALL_MEMBERS"
        );

        return createResponse(200, { message: "Season deregistration in progress." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
}
