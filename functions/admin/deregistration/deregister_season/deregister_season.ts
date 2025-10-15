import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    getItem,
    queryItems,
    removeItem,
    updateItem
} from "./function_helpers";

const s3Client = new S3Client({});

async function addToHistoricalReportingBucket(club_account_id: string, cycle_name: string, key_name: string, data: any) {
    const bucket_name = process.env.HISTORICAL_REPORTING_BUCKET_NAME;

    const uploadParams = {
        Bucket: bucket_name,
        Key: `${club_account_id}/${cycle_name}/${key_name}.json`,
        Body: JSON.stringify(data),
        ContentType: "application/json",
    };

    const command = new PutObjectCommand(uploadParams);
    console.log(`@@@ putItem request (Bucket_Name: ${bucket_name}): `, JSON.stringify(command));
    const response = await s3Client.send(command);
    console.log(`@@@ putItem response (Bucket_Name: ${bucket_name}): `, JSON.stringify(response));
}

async function handleClubMemberTable(club_account_id: string) {
    const club_members = await queryItems(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id },
        process.env.CLUB_MEMBER_CLUB_ACCOUNT_ID_INDEX as string
    );

    if (club_members) {
        for (const club_member of club_members) {

            await updateItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    user_id: club_member.user_id,
                    club_account_id: club_account_id
                },
                "SET #registered = :registered, #resubmission_required = :resubmission_required",
                {
                    "#registered": "registered",
                    "#resubmission_required": "resubmission_required"
                },
                {
                    ":registered": false,
                    ":resubmission_required": true
                }
            )

        }
    }
}

async function handleClubReporting(club_account_id: string, cycle_name: string) {
    const club_reports = await queryItems(
        process.env.CLUB_REPORTING_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id }
    );

    const historical_reports: any[] = []

    if (club_reports) {
        for (const club_report of club_reports) {
            historical_reports.push(club_report);

            await removeItem(
                process.env.CLUB_REPORTING_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    year_month: club_report.year_month
                }
            )

        }
    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "ClubReporting", historical_reports);
}

async function handleMonthlyBilling(club_account_id: string, cycle_name: string) {
    const billing_reports = await queryItems(
        process.env.BILLING_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id }
    );

    const historical_reports: any[] = []
    if (billing_reports) {
        for (const billing_report of billing_reports) {
            historical_reports.push(billing_report);

            await removeItem(
                process.env.BILLING_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    year_month: billing_report.year_month
                }
            )

        }
    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "MonthlyBilling", historical_reports);
}

async function handleRegistrations(club_account_id: string, cycle_name: string) {
    const registrations = await queryItems(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id },
        process.env.REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX as string
    );

    const historical_reports: any[] = []
    if (registrations) {
        for (const registration of registrations) {
            historical_reports.push(registration);

            if (registration?.deregistered) {
                await removeItem(
                    process.env.REGISTRATIONS_TABLE_NAME as string,
                    {
                        user_id: registration.user_id,
                        registration_id: registration.registration_id
                    }
                )
            } else {
                await updateItem(
                    process.env.REGISTRATIONS_TABLE_NAME as string,
                    {
                        user_id: registration.user_id,
                        registration_id: registration.registration_id
                    },
                    "SET #deregistered = :deregistered, #last_season_registration = :last_season_registration, #deregistered_on = :deregistered_on",
                    {
                        "#deregistered": "deregistered",
                        "#last_season_registration": "last_season_registration",
                        "#deregistered_on": "deregistered_on"
                    },
                    {
                        ":deregistered": true,
                        ":last_season_registration": true,
                        ":deregistered_on": Date.now()
                    }
                )

            }
        }
    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "Registrations", historical_reports);
}

async function handleTransactions(club_account_id: string, cycle_name: string) {
    const transactions = await queryItems(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id }
    );

    const historical_reports: any[] = []
    if (transactions) {
        for (const transaction of transactions) {
            historical_reports.push(transaction);

            await removeItem(
                process.env.TRANSACTIONS_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    transaction_id: transaction.transaction_id
                }
            )
        }
    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "Transaction", historical_reports);
}

export const handler = async (event: any) => {

    console.log("-------------------------------");
    console.log(`EVENT @ ${new Date()}: `, event);

    try {
        for (const record of event.Records) {
            const body = JSON.parse(record.body);

            const { club_account_id } = body;

            const club = await getItem(
                process.env.CLUB_TABLE_NAME as string,
                {
                    club_account_id: club_account_id
                }
            )

            if (!club) continue

            let season_cycle = 1
            if (club?.season_cycle) {
                season_cycle = club.season_cycle
            }
            const cycle_name = `Season_${season_cycle}`

            await handleClubMemberTable(club_account_id);
            await handleClubReporting(club_account_id, cycle_name);
            await handleMonthlyBilling(club_account_id, cycle_name);
            await handleRegistrations(club_account_id, cycle_name);
            await handleTransactions(club_account_id, cycle_name);

            await updateItem(
                process.env.CLUB_TABLE_NAME as string,
                { "club_account_id": body.club_account_id },
                "SET #deregistration_in_progress = :true, #season_cycle = :season_cycle",
                { 
                    "#deregistration_in_progress": "deregistration_in_progress",
                    "#season_cycle": "season_cycle"
                },
                { 
                    ":true": false,
                    ":season_cycle": season_cycle + 1
                }
            );
        }

        console.log("-------------------------------");

    } catch (error) {
        console.error("Error:", error);
        console.log("-------------------------------");
    }
};