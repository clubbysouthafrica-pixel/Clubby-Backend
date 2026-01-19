import { getItem } from "./database_functions";

export async function getClubEmailSendingLimit(club_account_id: string, emails: string[], temp_club: Record<string, any> | null = null): Promise<string | Record<string, string | number>> {
    let club: Record<string, any> | null = temp_club;
    if (!club) {
        club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                club_account_id: club_account_id
            }
        );
    }

    if (!club) {
        return "Club does not exist."
    }

    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthly_bill = await getItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month
        }
    )

    const emails_sent = monthly_bill?.total_emails ?? 0;

    if (emails_sent + emails.length > club.maximum_monthly_emails) {
        return `Monthly email limit reached. Could not send registration email. Available emails: ${club?.maximum_monthly_emails - emails_sent}.`
    }

    return {
        support_email: club.support_email,
        email_source: club.club_from_email,
        free_email_limit: club.free_email_limit,
        email_fee: club.fee_per_email_to_club,
        emails_sent: emails_sent
    }
}