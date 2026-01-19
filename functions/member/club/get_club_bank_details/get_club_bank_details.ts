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

        let outstanding_amount = 0;
        let options = [] as any[];
        if (club_member.registered === false) {
            outstanding_amount = registration_fee["total_outstanding_amount"];
        } else {
            const orders = await queryItems(
                process.env.ORDERS_TABLE_NAME!,
                "user_id = :user_id AND club_account_id = :club_account_id",
                {
                    ":user_id": user_id as string,
                    ":club_account_id": query_string_params.club_account_id
                },
                process.env.ORDERS_INDEX_NAME
            );
            outstanding_amount += orders?.reduce((sum, order) => {
                const outstandingOrderAmount = order["total_amount"] - order["amount_paid"];
                return outstandingOrderAmount > 0 ? sum + outstandingOrderAmount : sum;
            }, 0) || 0;
            options = orders?.filter(order => (order["total_amount"] - order["amount_paid"]) > 0).map(order => {
                const outstandingAmount = order["total_amount"] - order["amount_paid"];
                return { order_id: order["order_id"], items: order["items"], outstanding_amount: outstandingAmount, total_amount: order["total_amount"] };
            }) ?? [];
        }

        return createResponse(200, {
            bank: item["bank"],
            account_number: item["account_number"],
            branch_code: item["branch_code"],
            account_type: item["account_type"],
            registration_payment_reference: club_member["registration_payment_reference"],
            outstanding_amount: outstanding_amount,
            order_options: options
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
