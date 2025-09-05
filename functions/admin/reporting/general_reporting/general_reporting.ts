import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        );

        if (!club_members) {
            return createResponse(200, {
                total_registered_members: 0,
                total_pending_members: 0,
                total_registration_fees_due_by_pending_members: 0,
                total_registration_fees: 0,
                total_extra_fees_owed_by_registered_members: 0
            }, origin);
        }

        let report: Record<string, any> = {}

        report = {
            total_registered_members: 0,
            total_pending_members: 0,
            total_registration_fees_due_by_pending_members: 0,
            total_registration_fees: 0,
            total_extra_fees_owed_by_registered_members: 0
        }

        club_members?.forEach(member => {
            if (member.registered) {
                const year_month = member.registered_on.slice(0, 7);

                if (!report[year_month]) {
                    report[year_month] = {
                        total_registered_members: 0,
                        total_pending_members: 0,
                        total_registration_fees_due_by_pending_members: 0,
                        total_registration_fees: 0,
                        total_extra_fees_owed_by_registered_members: 0
                    }
                }

                report[year_month].total_registered_members = report[year_month]?.total_registered_members ? report[year_month].total_registered_members + 1 : 1
                report[year_month].total_registration_fees = report[year_month]?.total_registration_fees ? report[year_month].total_registration_fees + member.registration_amount : member.registration_amount
                report[year_month].total_extra_fees_owed_by_registered_members = report[year_month]?.total_extra_fees_owed_by_registered_members ? report[year_month].total_extra_fees_owed_by_registered_members + member.outstanding_amount : member.outstanding_amount
                report.total_registered_members = report?.total_registered_members ? report.total_registered_members + 1 : 1
                report.total_registration_fees = report?.total_registration_fees ? report.total_registration_fees + member.registration_amount : member.registration_amount
                report.total_extra_fees_owed_by_registered_members = report?.total_extra_fees_owed_by_registered_members ? report.total_extra_fees_owed_by_registered_members + member.outstanding_amount : member.outstanding_amount
            } else {
                const year_month = member.registration_submitted_on.slice(0, 7);

                if (!report[year_month]) {
                    report[year_month] = {
                        total_registered_members: 0,
                        total_pending_members: 0,
                        total_registration_fees_due_by_pending_members: 0,
                        total_registration_fees: 0,
                        total_extra_fees_owed_by_registered_members: 0
                    }
                }

                const difference = member.registration_amount - member.outstanding_amount

                report[year_month].total_pending_members = report[year_month]?.total_pending_members ? report[year_month].total_pending_members + 1 : 1
                report[year_month].total_registration_fees_due_by_pending_members = report[year_month]?.total_registration_fees_due_by_pending_members ? report[year_month].total_registration_fees_due_by_pending_members + member.outstanding_amount : member.outstanding_amount
                report[year_month].total_registration_fees = report[year_month]?.total_registration_fees ? report[year_month].total_registration_fees + difference : difference

                report.total_pending_members = report?.total_pending_members ? report.total_pending_members + 1 : 1
                report.total_registration_fees_due_by_pending_members = report?.total_registration_fees_due_by_pending_members ? report.total_registration_fees_due_by_pending_members + member.outstanding_amount : member.outstanding_amount

                report.total_registration_fees = report?.total_registration_fees ? report.total_registration_fees + difference : difference
            }
        });

        return createResponse(200, { report }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
