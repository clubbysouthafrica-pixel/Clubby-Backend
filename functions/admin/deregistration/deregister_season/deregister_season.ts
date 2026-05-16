import { PutObjectCommand, S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
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

            const filteredRegistration: any = {};
            for (const [key, value] of Object.entries(registration)) {
                if (key.startsWith("reg_field_")) {
                    if (typeof value === "object" && value !== null && "type" in value) {
                        const fieldType = (value as any).type;

                        if (fieldType && String(fieldType).startsWith("BILLING_")) {
                            filteredRegistration[key] = value;
                        }
                    }
                } else {
                    filteredRegistration[key] = value;
                }
            }
            historical_reports.push(filteredRegistration);

            if (registration.latest_registration === false) {
                await removeItem(
                    process.env.REGISTRATIONS_TABLE_NAME as string,
                    {
                        user_id: registration.user_id,
                        registration_id: registration.registration_id
                    }
                )
            } else if (registration?.deregistered) {
                await updateItem(
                    process.env.REGISTRATIONS_TABLE_NAME as string,
                    {
                        user_id: registration.user_id,
                        registration_id: registration.registration_id
                    },
                    "SET #last_season_registration = :last_season_registration",
                    {
                        "#last_season_registration": "last_season_registration"
                    },
                    {
                        ":last_season_registration": true
                    }
                )
            } else {
                await updateItem(
                    process.env.REGISTRATIONS_TABLE_NAME as string,
                    {
                        user_id: registration.user_id,
                        registration_id: registration.registration_id
                    },
                    "SET #deregistered = :deregistered, #last_season_registration = :last_season_registration, #deregistered_on = :deregistered_on, #deregistration_reason = :deregistration_reason",
                    {
                        "#deregistered": "deregistered",
                        "#last_season_registration": "last_season_registration",
                        "#deregistered_on": "deregistered_on",
                        "#deregistration_reason": "deregistration_reason"
                    },
                    {
                        ":deregistered": true,
                        ":last_season_registration": true,
                        ":deregistered_on": Date.now(),
                        ":deregistration_reason": "Season ended"
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
            const { name, user_id, ...filteredTransactions } = transaction;
            historical_reports.push(filteredTransactions);

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

async function handleRegistrationForm(club_account_id: string, cycle_name: string) {
    const registration_forms = await queryItems(
        process.env.REGISTRATION_FORM_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id }
    );

    const historical_reports: any[] = []
    if (registration_forms) {
        for (const form of registration_forms) {
            historical_reports.push(form);

            if (form.visible === false) {
                await removeItem(
                    process.env.REGISTRATION_FORM_TABLE_NAME as string,
                    {
                        club_account_id: club_account_id,
                        field_id: form.field_id
                    }
                )
            }
        }
    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "RegistrationForm", historical_reports);
}

async function handleOrders(club_account_id: string, cycle_name: string) {
    const orders = await queryItems(
        process.env.ORDERS_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id }
    );

    const historical_reports: any[] = []
    if (orders) {
        for (const order of orders) {
            historical_reports.push(order);

            await removeItem(
                process.env.ORDERS_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    order_id: order.order_id
                }
            )
        }
    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "Orders", historical_reports);
}

async function handleStorageRequests(club_account_id: string, cycle_name: string) {
    const storage_requests = await queryItems(
        process.env.STORAGE_REQUESTS_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id }
    );

    const historical_reports: any[] = []
    if (storage_requests) {
        for (const request of storage_requests) {
            historical_reports.push(request);

            await removeItem(
                process.env.STORAGE_REQUESTS_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    storage_request_id: request.storage_request_id
                }
            )
            await updateItem(
                process.env.STORAGE_TABLE_NAME as string,
                {
                    club_account_id: club_account_id,
                    storage_id: request.storage_id
                },
                "SET #isBooked = :isBooked",
                {
                    "#isBooked": "isBooked"
                },
                {
                    ":isBooked": true
                }
            )
        }
    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "StorageRequests", historical_reports);
}

async function handleEventRegistrations(club_account_id: string, cycle_name: string) {
    const events = await queryItems(
        process.env.EVENTS_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id }
    );

    const event_historical_reports: any[] = []
    const event_registrations_historical_reports: any[] = []
    for (const event of events ?? []) {


        event_historical_reports.push(event);

        await removeItem(
            process.env.EVENTS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                event_id: event.event_id
            }
        );

        const event_registrations = await queryItems(
            process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
            "event_id = :eventId",
            { ":eventId": event.event_id },
        );

        if (!event_registrations || event_registrations.length === 0) continue
        event_registrations_historical_reports.push(...event_registrations);

        for (const event of event_registrations) {
            await removeItem(
                process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
                {
                    event_id: event.event_id,
                    event_registration_id: event.event_registration_id
                }
            );
        }

    }
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "Events", event_historical_reports);
    await addToHistoricalReportingBucket(club_account_id, cycle_name, "EventRegistrations", event_registrations_historical_reports);
}

async function deleteClubSignatures(club_account_id: string): Promise<void> {
    const prefix = `${club_account_id}/`;
    let continuationToken: string | undefined;

    try {
        while (true) {
            const listCommand = new ListObjectsV2Command({
                Bucket: process.env.SIGNATURES_BUCKET_NAME,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            });

            console.log(`@@@ listObjects request (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}, Prefix: ${prefix})`);
            const listResponse = await s3Client.send(listCommand);
            console.log(`@@@ listObjects response (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}):`, JSON.stringify(listResponse));

            if (!listResponse.Contents || listResponse.Contents.length === 0) {
                console.log(`No signatures found for club ${club_account_id}`);
                break;
            }

            const deleteCommand = new DeleteObjectsCommand({
                Bucket: process.env.SIGNATURES_BUCKET_NAME,
                Delete: {
                    Objects: listResponse.Contents.map(obj => ({
                        Key: obj.Key!,
                    })),
                },
            });

            console.log(`@@@ deleteObjects request (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}, Count: ${listResponse.Contents.length})`);
            const deleteResponse = await s3Client.send(deleteCommand);
            console.log(`@@@ deleteObjects response (Bucket_Name: ${process.env.SIGNATURES_BUCKET_NAME}):`, JSON.stringify(deleteResponse));

            if (!listResponse.IsTruncated) {
                break;
            }

            continuationToken = listResponse.NextContinuationToken;
        }

        console.log(`✅ Successfully deleted all signatures for club ${club_account_id}`);
    } catch (error: any) {
        console.error(`Error deleting signatures for club ${club_account_id}:`, error);
        throw error;
    }
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
            await handleMonthlyBilling(club_account_id, cycle_name);
            await handleRegistrations(club_account_id, cycle_name);
            await handleTransactions(club_account_id, cycle_name);
            await handleRegistrationForm(club_account_id, cycle_name);
            await handleOrders(club_account_id, cycle_name);
            await handleEventRegistrations(club_account_id, cycle_name);
            await handleStorageRequests(club_account_id, cycle_name);
            await deleteClubSignatures(club_account_id);

            const currentEpoch = Date.now();
            const updatedSeasons = club.seasons ? [...club.seasons] : [];

            if (updatedSeasons.length > 0) {
                updatedSeasons[updatedSeasons.length - 1].end_date = currentEpoch;
            }

            updatedSeasons.push({
                start_date: currentEpoch,
                end_date: null
            });

            await updateItem(
                process.env.CLUB_TABLE_NAME as string,
                { "club_account_id": body.club_account_id },
                "SET #deregistration_in_progress = :true, #season_cycle = :season_cycle, #seasons = :seasons",
                {
                    "#deregistration_in_progress": "deregistration_in_progress",
                    "#season_cycle": "season_cycle",
                    "#seasons": "seasons"
                },
                {
                    ":true": false,
                    ":season_cycle": season_cycle + 1,
                    ":seasons": updatedSeasons
                }
            );
        }

        console.log("-------------------------------");

    } catch (error) {
        console.error("Error:", error);
        console.log("-------------------------------");
    }
};