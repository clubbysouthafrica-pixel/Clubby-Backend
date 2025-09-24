import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const registration_fees = await queryItems(
            process.env.REGISTRATION_FEES_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        );

        let report: Record<string, any> = {}

        report = {
            total_registered_members: 0,
            total_pending_members: 0,
            total_pending_revenue: 0,
            total_revenue: 0,
            total_deregistered_members: 0
        }

        registration_fees?.forEach(registration_fee => {
            if (registration_fee.total_outstanding_amount == 0) {
                if (!report.data) {
                    report.data = []
                }
                const date = new Date(registration_fee.registered_on);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year_month = `${year}/${month}`;

                let index = report.data.findIndex((item: any) => item.date === year_month);
                if (index < 0) {
                    report.data.push({
                        date: year_month,
                        total_registered_members: 0,
                        total_pending_members: 0,
                        total_pending_revenue: 0,
                        total_revenue: 0,
                        total_deregistered_members: 0
                    });
                    index = report.data.length - 1;
                }

                // Month calculation
                if (!registration_fee.deregistered) {
                    report.data[index].total_registered_members = report.data[index]?.total_registered_members ? report.data[index].total_registered_members + 1 : 1
                }
                report.data[index].total_revenue = report.data[index]?.total_revenue ? report.data[index].total_revenue + registration_fee.total_fee : registration_fee.total_fee

                // Year calculation
                report.total_registered_members = report?.total_registered_members ? report.total_registered_members + 1 : 1
                report.total_revenue = report?.total_revenue ? report.total_revenue + registration_fee.total_fee : registration_fee.total_fee

            } else {
                if (!report.data) {
                    report.data = []
                }
                const date = new Date(registration_fee.registered_on);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year_month = `${year}/${month}`;

                let index = report.data.findIndex((item: any) => item.date === year_month);
                if (index < 0) {
                    report.data.push({
                        date: year_month,
                        total_registered_members: 0,
                        total_pending_members: 0,
                        total_pending_revenue: 0,
                        total_revenue: 0
                    });
                    index = report.data.length - 1;
                }

                const difference = registration_fee.total_fee - registration_fee.total_outstanding_amount

                report.data[index].total_pending_members = report.data[index]?.total_pending_members ? report.data[index].total_pending_members + 1 : 1
                report.data[index].total_pending_revenue = report.data[index]?.total_pending_revenue ? report.data[index].total_pending_revenue + registration_fee.total_outstanding_amount : registration_fee.total_outstanding_amount
                report.data[index].total_revenue = report.data[index]?.total_revenue ? report.data[index].total_revenue + difference : difference

                report.total_pending_members = report?.total_pending_members ? report.total_pending_members + 1 : 1
                report.total_pending_revenue = report?.total_pending_revenue ? report.total_pending_revenue + registration_fee.total_outstanding_amount : registration_fee.total_outstanding_amount
                report.total_revenue = report?.total_revenue ? report.total_revenue + difference : difference
            }
        });

        return createResponse(200, report, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
