import {
  createResponse,
  deconstructEvent,
  updateItem,
} from "./function_helpers";

function validateTemplateVariables(template: string): string | null {
  const regex = /\{\{(\w+)\}\}/g;
  let match;

  while ((match = regex.exec(template)) !== null) {
    const variable = match[1];

    if (variable !== variable.toLowerCase()) {
      return `Template variable '{{${variable}}}' contains uppercase letters. Variables must be lowercase. Valid example: {{custom_variable}}.`;
    }

    if (!/^[a-z_]+$/.test(variable)) {
      return `Template variable '{{${variable}}}' contains invalid characters. Variables can only contain lowercase letters and underscores. Valid example: {{custom_variable}}.`;
    }
  }

  return null;
}

function validateBody(body: Record<string, string>): string | null {
  if (body?.club_account_id == null) {
    return "Invalid body. Required attributes: club_account_id.";
  }
  if (typeof body.club_account_id !== "string") {
    return "Invalid body. Required attribute types: club_account_id (string).";
  }

  if (body?.bank_details) {
    if (typeof body.bank_details !== "object") {
      return "Invalid bank details format.";
    }

    const bank_details: Record<string, string> = body.bank_details;

    const allFieldsProvided =
      bank_details.bank != null &&
      bank_details.account_number != null &&
      bank_details.branch_code != null &&
      bank_details.account_type != null;

    if (allFieldsProvided) {
      if (
        typeof bank_details.bank !== "string" ||
        typeof bank_details.account_number !== "string" ||
        typeof bank_details.branch_code !== "string" ||
        typeof bank_details.account_type !== "string"
      ) {
        return "All bank details must be strings.";
      }
    }
  }

  if (
    body?.registration_success_email_template_body &&
    typeof body.registration_success_email_template_body === "string"
  ) {
    const templateValidationError = validateTemplateVariables(
      body.registration_success_email_template_body,
    );
    if (templateValidationError) {
      return templateValidationError;
    }
  }

  if (
    body?.registration_submission_email_template_body &&
    typeof body.registration_submission_email_template_body === "string"
  ) {
    const templateValidationError = validateTemplateVariables(
      body.registration_submission_email_template_body,
    );
    if (templateValidationError) {
      return templateValidationError;
    }
  }

  if (body?.club_variables) {
    if (!Array.isArray(body.club_variables)) {
      return "Invalid club_variables format. Must be an array.";
    }

    for (const variable of body.club_variables) {
      if (typeof variable !== "object" || variable === null) {
        return "Each club_variable must be an object.";
      }

      if (typeof variable.name !== "string") {
        return "Each club_variable must have a 'name' property of type string.";
      }

      if (typeof variable.key !== "string") {
        return "Each club_variable must have a 'key' property of type string.";
      }

      if (typeof variable.visible !== "boolean") {
        return "Each club_variable must have a 'visible' property of type boolean.";
      }
    }
  }

  return null;
}

export const handler = async (event: any) => {
  const { origin, body, query_string_params, user_id } =
    deconstructEvent(event);

  try {
    const invalid_body_message = validateBody(body);
    if (invalid_body_message) {
      return createResponse(400, { message: invalid_body_message }, origin);
    }

    const key = {
      club_account_id: body.club_account_id,
    };

    let updateExpression = "SET ";
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    const updateParts: string[] = [];

    if (body?.bank_details) {
      const bankDetails = body.bank_details;

      updateParts.push(
        "#bank = :bank",
        "#acc = :acc",
        "#branch = :branch",
        "#type = :type",
      );

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

    if (typeof body?.auto_register_members_if_paid === "boolean") {
      updateParts.push(
        "#auto_register_members_if_paid = :auto_register_members_if_paid",
      );
      expressionAttributeNames["#auto_register_members_if_paid"] =
        "auto_register_members_if_paid";
      expressionAttributeValues[":auto_register_members_if_paid"] =
        body.auto_register_members_if_paid;
    }

    if (typeof body?.notify_on_member_registration === "boolean") {
      updateParts.push(
        "#notify_on_member_registration = :notify_on_member_registration",
      );
      expressionAttributeNames["#notify_on_member_registration"] =
        "notify_on_member_registration";
      expressionAttributeValues[":notify_on_member_registration"] =
        body.notify_on_member_registration;
    }

    if (typeof body?.enable_events === "boolean") {
      updateParts.push(
        "#enable_events = :enable_events",
      );
      expressionAttributeNames["#enable_events"] =
        "enable_events";
      expressionAttributeValues[":enable_events"] =
        body.enable_events;
    }

    if (
      body?.registration_submission_email_template_body &&
      typeof body.registration_submission_email_template_body === "string"
    ) {
      updateParts.push(
        "#registration_submission_email_template_body = :registration_submission_email_template_body",
      );
      expressionAttributeNames["#registration_submission_email_template_body"] =
        "registration_submission_email_template_body";
      expressionAttributeValues[
        ":registration_submission_email_template_body"
      ] = body.registration_submission_email_template_body;
    }

    if (
      body?.registration_submission_email_subject &&
      typeof body.registration_submission_email_subject === "string"
    ) {
      updateParts.push(
        "#registration_submission_email_subject = :registration_submission_email_subject",
      );
      expressionAttributeNames["#registration_submission_email_subject"] =
        "registration_submission_email_subject";
      expressionAttributeValues[":registration_submission_email_subject"] =
        body.registration_submission_email_subject;
    }

    if (
      body?.registration_success_email_template_body &&
      typeof body.registration_success_email_template_body === "string"
    ) {
      updateParts.push(
        "#registration_success_email_template_body = :registration_success_email_template_body",
      );
      expressionAttributeNames["#registration_success_email_template_body"] =
        "registration_success_email_template_body";
      expressionAttributeValues[":registration_success_email_template_body"] =
        body.registration_success_email_template_body;
    }

    if (
      body?.registration_success_email_subject &&
      typeof body.registration_success_email_subject === "string"
    ) {
      updateParts.push(
        "#registration_success_email_subject = :registration_success_email_subject",
      );
      expressionAttributeNames["#registration_success_email_subject"] =
        "registration_success_email_subject";
      expressionAttributeValues[":registration_success_email_subject"] =
        body.registration_success_email_subject;
    }

    if (typeof body?.use_success_email_template === "boolean") {
      updateParts.push(
        "#use_success_email_template = :use_success_email_template",
      );
      expressionAttributeNames["#use_success_email_template"] =
        "use_success_email_template";
      expressionAttributeValues[":use_success_email_template"] =
        body.use_success_email_template;
    }

    if (body?.club_url !== undefined && typeof body.club_url === "string") {
      updateParts.push("#club_url = :club_url");
      expressionAttributeNames["#club_url"] = "club_url";
      expressionAttributeValues[":club_url"] = body.club_url;
    }

    if (
      body?.instagram_url !== undefined &&
      typeof body.instagram_url === "string"
    ) {
      updateParts.push("#instagram_url = :instagram_url");
      expressionAttributeNames["#instagram_url"] = "instagram_url";
      expressionAttributeValues[":instagram_url"] = body.instagram_url;
    }

    if (Array.isArray(body.opening_times)) {
      updateParts.push("#opening_times = :opening_times");
      expressionAttributeNames["#opening_times"] = "opening_times";
      expressionAttributeValues[":opening_times"] = body.opening_times;
    }

    if (
      body?.facebook_url !== undefined &&
      typeof body.facebook_url === "string"
    ) {
      updateParts.push("#facebook_url = :facebook_url");
      expressionAttributeNames["#facebook_url"] = "facebook_url";
      expressionAttributeValues[":facebook_url"] = body.facebook_url;
    }

    if (body?.about_club !== undefined && typeof body.about_club === "string") {
      updateParts.push("#about_club = :about_club");
      expressionAttributeNames["#about_club"] = "about_club";
      expressionAttributeValues[":about_club"] = body.about_club;
    }

    if (typeof body?.use_submission_email_template === "boolean") {
      updateParts.push(
        "#use_submission_email_template = :use_submission_email_template",
      );
      expressionAttributeNames["#use_submission_email_template"] =
        "use_submission_email_template";
      expressionAttributeValues[":use_submission_email_template"] =
        body.use_submission_email_template;
    }

    if (Array.isArray(body?.club_variables)) {
      updateParts.push("#club_variables = :club_variables");
      expressionAttributeNames["#club_variables"] = "club_variables";
      expressionAttributeValues[":club_variables"] = body.club_variables;
    }

    if (typeof body.hide_from_public === "boolean") {
      updateParts.push("#hide_from_public = :hide_from_public");
      expressionAttributeNames["#hide_from_public"] = "hide_from_public";
      expressionAttributeValues[":hide_from_public"] = body.hide_from_public;
    }

    if (typeof body?.enable_shop === "boolean") {
      updateParts.push("#enable_shop = :enable_shop");
      expressionAttributeNames["#enable_shop"] = "enable_shop";
      expressionAttributeValues[":enable_shop"] = body.enable_shop;
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
      "attribute_exists(club_account_id)",
    );

    return createResponse(
      200,
      { message: "Club details updated successfully." },
      origin,
    );
  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      console.error("Club does not exist");
    }
    return createResponse(500, { message: error.message }, origin);
  }
};
