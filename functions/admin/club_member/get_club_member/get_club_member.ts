import { createResponse, deconstructEvent, getItem, decryptData } from "./function_helpers";

export const handler = async (event: any) => {
	const { origin, query_string_params } = deconstructEvent(event);

	try {
		if (query_string_params?.club_account_id == null) {
			return createResponse(400, { message: "club_account_id required." }, origin);
		}
		if (typeof query_string_params.club_account_id !== "string") {
			return createResponse(400, { message: "club_account_id must be string." }, origin);
		}
		if (query_string_params?.member_user_id == null) {
			return createResponse(400, { message: "member_user_id required." }, origin);
		}
		if (typeof query_string_params.member_user_id !== "string") {
			return createResponse(400, { message: "member_user_id must be string." }, origin);
		}

		const user = await getItem(process.env.USERS_TABLE_NAME as string, {
			user_type: process.env.USER_TYPE as string,
			user_id: query_string_params.member_user_id
		});

		if (user == null) {
			return createResponse(404, { message: "User not found" }, origin);
		}

        let is_club_member = false;
        let registration: string | null = null;

		const clubMember = await getItem(process.env.CLUB_MEMBER_TABLE_NAME as string, {
			club_account_id: query_string_params.club_account_id,
			user_id: query_string_params.member_user_id
		});

        if (clubMember != null) {
            is_club_member = true;
            const member_registration = await getItem(process.env.CLUB_REGISTRATION_TABLE_NAME as string, {
                user_id: query_string_params.member_user_id,
                registration_id: clubMember.current_reg_id
            });

            if (member_registration) {
				if (member_registration?.last_season_registration) registration = "DEREGISTERED (LAST SEASONS REGISTRATION)";
				else if (member_registration?.deregistered_on || member_registration?.deregistered) registration = "DEREGISTERED";
				else if (member_registration?.registered_on) registration = "REGISTERED";
				else registration = "PENDING";
            }
        }

		return createResponse(200, {
			user: {
				first_name: "first_name" in user ? user["first_name"] : undefined,
				surname: "surname" in user ? user["surname"] : undefined
			},
			is_club_member: clubMember != null,
			registration
		}, origin);
	} catch (error) {
		console.error("Error:", error);
		return createResponse(500, { message: "Internal Server Error" }, origin);
	}
};
