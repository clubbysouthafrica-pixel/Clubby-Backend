import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_type and club_account_id required." }, origin);
        }

        const item = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (item == null) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            }
        );
        if (!club_member) {
            return createResponse(400, { message: "User is not a member of this club." }, origin);
        }

        const registration_fee = await getItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                user_id: user_id as string,
                registration_id: club_member.current_reg_id
            }
        )
        if (!registration_fee) {
            return createResponse(400, { message: "User has no registration fee associated." }, origin);
        }

        let total_outstanding_amount = 0;
        let transaction_options = [] as any[];
        if (club_member.registered === false) {
            total_outstanding_amount = registration_fee["total_outstanding_amount"];
        } else {
            const transactions = await queryItems(
                process.env.TRANSACTIONS_TABLE_NAME as string,
                "club_account_id = :clubId AND user_id = :userId",
                {
                    ":clubId": query_string_params.club_account_id,
                    ":userId": user_id as string,
                },
                process.env.TRANSACTIONS_USER_ID_INDEX as string
            );

            const filteredTransactions = transactions?.filter((transaction) => {
                const outstandingAmount = (transaction["amount"] ?? 0) - (transaction["amount_paid"] ?? 0);
                const status = transaction["status"];

                return outstandingAmount > 0 && (status === "PENDING" || status === "PARTIALLY PAID");
            }) ?? [];

            transaction_options = filteredTransactions.map((transaction) => {
                const outstandingAmount = (transaction["amount"] ?? 0) - (transaction["amount_paid"] ?? 0);
                total_outstanding_amount += outstandingAmount;
                return {
                    transaction_id: transaction["transaction_id"],
                    type: transaction["type"],
                    outstanding_amount: outstandingAmount,
                    total_amount: transaction["amount"],
                    order_id: transaction?.["order_id"] ?? undefined,         	
                    event_registration_id: transaction?.["event_registration_id"] ?? undefined,
                    event_id: transaction?.["event_id"] ?? undefined
                };
            });
            
        }

        return createResponse(200, {
            bank: item["bank"],
            account_number: item["account_number"],
            branch_code: item["branch_code"],
            account_type: item["account_type"],
            registration_payment_reference: club_member["registration_payment_reference"],
            outstanding_amount: total_outstanding_amount,
            transaction_options: transaction_options
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
