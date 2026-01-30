import { createResponse, deconstructEvent, getItem } from "./function_helpers";

export const handler = async (event: any) => {
  const { origin, body, query_string_params, user_id } =
    deconstructEvent(event);

  try {
    if (query_string_params?.club_account_id == null) {
      return createResponse(
        400,
        { message: "club_account_id required." },
        origin,
      );
    }

    const item = await getItem(process.env.CLUB_TABLE_NAME as string, {
      club_account_id: query_string_params.club_account_id,
    });

    if (item == null) {
      return createResponse(200, {}, origin);
    }

    const hasBankDetails =
      item?.bank &&
      item?.account_number &&
      item?.branch_code &&
      item?.account_type;

    return createResponse(
      200,
      {
        bank_details: hasBankDetails
          ? {
              bank: item.bank,
              account_number: item.account_number,
              branch_code: item.branch_code,
              account_type: item.account_type,
            }
          : undefined,
        instagram_url: item?.instagram_url,
        facebook_url: item?.facebook_url,
        about_club: item?.about_club,
        opening_times: item?.opening_times,
        country_of_operation: item?.country_of_operation,
        currency: item?.currency,
        support_email: item?.support_email,
        notify_on_member_registration:
          item?.notify_on_member_registration ?? true,
        registration_submission_email_template_body:
          item?.registration_submission_email_template_body,
        registration_submission_email_subject:
          item?.registration_submission_email_subject,
        registration_success_email_template_body:
          item?.registration_success_email_template_body,
        registration_success_email_subject:
          item?.registration_success_email_subject,
        use_submission_email_template:
          item?.use_submission_email_template ?? false,
        use_success_email_template: item?.use_success_email_template ?? false,
        payfast_enabled: item?.payfast_enabled ?? false,
        custom_payment_methods: item?.custom_payment_methods ?? [],
        club_url: item?.club_url ?? undefined,
        hide_from_public: item?.hide_from_public ?? false,
      },
      origin,
    );
  } catch (error) {
    console.error("Error:", error);
    return createResponse(500, { message: "Internal Server Error" }, origin);
  }
};
