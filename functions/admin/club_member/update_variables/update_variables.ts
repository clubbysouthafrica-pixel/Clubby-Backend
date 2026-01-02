import {
    createResponse,
    deconstructEvent,
    getItem,
    updateItem
} from "./function_helpers";

async function getRegistration(user_id: string, registration_id: string): Promise<any> {
    return await getItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: user_id,
            registration_id: registration_id,
        }
    )
}

async function getClubMember(user_id: string, club_account_id: string): Promise<any | null> {
    return await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            user_id: user_id as string
        }
    );
}

export const handler = async (event: any) => {
    const { origin, body, query_string_params } = deconstructEvent(event);

    try {
        if (query_string_params?.user_id == null || query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "user_id and club_account_id required in query string params." }, origin);
        }

        if (typeof query_string_params.user_id !== 'string' || typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "user_id and club_account_id must be STRING type." }, origin);
        }

        if (body?.variable_name == null || body?.variable_value == null) {
            return createResponse(400, { message: "variable_name and variable_value required in request body." }, origin);
        }

        if (typeof body.variable_name !== 'string' || typeof body.variable_value !== 'string') {
            return createResponse(400, { message: "variable_name and variable_value must be STRING type." }, origin);
        }

        const club_member = await getClubMember(query_string_params.user_id as string, query_string_params.club_account_id as string);
        if (!club_member) {
            return createResponse(404, { message: "Club member not found." }, origin);
        }

        const member_registration = await getRegistration(query_string_params.user_id, club_member.current_reg_id);
        if (!member_registration) {
            return createResponse(404, { message: "Member registration not found." }, origin);
        }

        const template_variables = member_registration?.template_variables ?? [];

        const variableIndex = template_variables.findIndex((v: any) => v.name === body.variable_name);

        if (variableIndex >= 0) {
            template_variables[variableIndex].value = body.variable_value;
        } else {
            template_variables.push({
                name: body.variable_name,
                value: body.variable_value
            });
        }

        await updateItem(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            {
                user_id: query_string_params.user_id,
                registration_id: club_member.current_reg_id
            },
            "SET #template_variables = :template_variables",
            { "#template_variables": "template_variables" },
            { ":template_variables": template_variables }
        )

        return createResponse(200, { message: "Template variable updated successfully." }, origin);

    } catch (error: any) {
        console.error('Update variables error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
