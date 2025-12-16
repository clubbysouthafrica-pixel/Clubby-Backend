import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

function validateBody(body: Record<string, string>): string | null {
    if (body?.club_account_id == null) {
        return "Invalid body. Required attributes: club_account_id."
    }
    if (typeof body.club_account_id !== 'string') {
        return "Invalid body. Required attribute types: club_account_id (string)."
    }

    if (body?.bank_details) {
        if (typeof body.bank_details !== 'object') {
            return "Please fill in bank details first."
        }

        const bank_details: Record<string, string> = body.bank_details;

        if (bank_details.bank == null || bank_details.account_number == null || bank_details.branch_code == null || bank_details.account_type == null) {
            return "Please fill in bank details first. All bank details must be provided."
        }

        if (typeof bank_details.bank !== "string" || typeof bank_details.account_number !== "string" || typeof bank_details.branch_code !== "string" || typeof bank_details.account_type !== "string") {
            return "Please fill in bank details first. All bank details must be provided."
        }

        if (bank_details.bank.trim() === "" || bank_details.account_number.trim() === "" || bank_details.branch_code.trim() === "" || bank_details.account_type.trim() === "") {
            return "Please fill in bank details first. All bank details must be provided."
        }
    }

    return null
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const invalid_body_message = validateBody(body);
        if (invalid_body_message) {
            return createResponse(400, { message: invalid_body_message }, origin);
        }

        const key = {
            club_account_id: body.club_account_id
        }

        let updateExpression = "SET ";
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        const updateParts: string[] = [];

        if (body?.bank_details) {
            const bankDetails = body.bank_details;

            updateParts.push("#bank = :bank", "#acc = :acc", "#branch = :branch", "#type = :type");

            expressionAttributeNames["#bank"] = "bank";
            expressionAttributeNames["#acc"] = "account_number";
            expressionAttributeNames["#branch"] = "branch_code";
            expressionAttributeNames["#type"] = "account_type";

            expressionAttributeValues[":bank"] = bankDetails.bank;
            expressionAttributeValues[":acc"] = bankDetails.account_number;
            expressionAttributeValues[":branch"] = bankDetails.branch_code;
            expressionAttributeValues[":type"] = bankDetails.account_type;
        }

        if (body?.country_of_operation) {
            updateParts.push("#country = :country");
            expressionAttributeNames["#country"] = "country_of_operation";
            expressionAttributeValues[":country"] = body.country_of_operation;
        }

        if (body?.currency) {
            updateParts.push("#currency = :currency");
            expressionAttributeNames["#currency"] = "currency";
            expressionAttributeValues[":currency"] = body.currency;
        }

        if (body?.support_email && typeof body.support_email === "string") {
            updateParts.push("#support_email = :support_email");
            expressionAttributeNames["#support_email"] = "support_email";
            expressionAttributeValues[":support_email"] = body.support_email;
        }

        if (typeof body?.notify_on_member_registration === "boolean") {
            updateParts.push("#notify_on_member_registration = :notify_on_member_registration");
            expressionAttributeNames["#notify_on_member_registration"] = "notify_on_member_registration";
            expressionAttributeValues[":notify_on_member_registration"] = body.notify_on_member_registration;
        }

        if (body?.registration_submission_email_template_body && typeof body.registration_submission_email_template_body === "string") {
            updateParts.push("#registration_submission_email_template_body = :registration_submission_email_template_body");
            expressionAttributeNames["#registration_submission_email_template_body"] = "registration_submission_email_template_body";
            expressionAttributeValues[":registration_submission_email_template_body"] = body.registration_submission_email_template_body;
        }

        if (body?.registration_success_email_template_body && typeof body.registration_success_email_template_body === "string") {
            updateParts.push("#registration_success_email_template_body = :registration_success_email_template_body");
            expressionAttributeNames["#registration_success_email_template_body"] = "registration_success_email_template_body";
            expressionAttributeValues[":registration_success_email_template_body"] = body.registration_success_email_template_body;
        }

        if (typeof body?.use_success_email_template === "boolean") {
            updateParts.push("#use_success_email_template = :use_success_email_template");
            expressionAttributeNames["#use_success_email_template"] = "use_success_email_template";
            expressionAttributeValues[":use_success_email_template"] = body.use_success_email_template;
        }

        if (body?.club_url !== undefined && typeof body.club_url === "string") {
            updateParts.push("#club_url = :club_url");
            expressionAttributeNames["#club_url"] = "club_url";
            expressionAttributeValues[":club_url"] = body.club_url;
        }

        if (typeof body?.use_submission_email_template === "boolean") {
            updateParts.push("#use_submission_email_template = :use_submission_email_template");
            expressionAttributeNames["#use_submission_email_template"] = "use_submission_email_template";
            expressionAttributeValues[":use_submission_email_template"] = body.use_submission_email_template;
        }

        if (typeof body.hide_from_public === "boolean") {
            updateParts.push("#hide_from_public = :hide_from_public");
            expressionAttributeNames["#hide_from_public"] = "hide_from_public";
            expressionAttributeValues[":hide_from_public"] = body.hide_from_public;
        }

        if (updateParts.length === 0) {
            return createResponse(200, { message: "Nothing to update." }, origin);
        }

        updateExpression += updateParts.join(", ");

        await updateItem(
            process.env.CLUB_TABLE_NAME as string,
            key,
            updateExpression,
            expressionAttributeNames,
            expressionAttributeValues,
            "attribute_exists(club_account_id)"
        );

        return createResponse(200, { message: "Club details updated successfully." }, origin);

    } catch (error: any) {
        if (error.name === "ConditionalCheckFailedException") {
            console.error("Club does not exist");
        }
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
