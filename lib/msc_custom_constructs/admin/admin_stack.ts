import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway, MSC_Bucket, MSC_Cognito, MSC_Queue, MSC_Kms } from '../../msc_service_constructs';
import {
    MSC_AdminLoginConstruct,
    MSC_AdminUserConstruct,
    MSC_AdminClubConstruct,
    MSC_ClubAdminClubConstruct,
    MSC_AdminRegistrationFormConstruct,
    MSC_ClubMemberClubConstruct,
    MSC_MailerConstruct,
    MSC_ReportingConstruct,
    MSC_DeregistrationConstruct,
    MSC_TransactionsConstruct,
    MSC_PayFastConstruct
} from "./constructs";
import { MSC_JWTConstruct } from "../authorization";
import { MSC_Table } from "../../msc_service_constructs";
import { MSC_MemberUserConstruct } from './constructs/member_user';
import { MSC_Layers } from '../lambda_layers';

export interface MSC_AdminNestedStackProps extends StackProps {
    users_table: MSC_Table;
    transactions_table: MSC_Table;
    club_table: MSC_Table;
    registrations_table: MSC_Table;
    club_admin_table: MSC_Table;
    product_table: MSC_Table;
    orders_table: MSC_Table;
    billing_table: MSC_Table;
    admin_user_pool: MSC_Cognito;
    member_user_pool: MSC_Cognito;
    registration_form_table: MSC_Table;
    club_deregistration_queue: MSC_Queue;
    email_rate_limiter_table: MSC_Table;
    club_member_table: MSC_Table;
    image_bucket: MSC_Bucket;
    shop_images_bucket: MSC_Bucket;
    club_history_bucket: MSC_Bucket;
    signatures_bucket: MSC_Bucket;
    mail_queue: MSC_Queue;
    kms_key: MSC_Kms;
}

export class MSC_AdminNestedStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_AdminNestedStackProps) {
        super(scope, id, props);

        const all_layers = new MSC_Layers(this, id, {});

        const api_gateway = new MSC_APIGateway(this, id, {
            domain: "admin",
            cert_arn: process.env.ADMIN_CERT_ARN as string
        });

        new MSC_AdminLoginConstruct(this, `${id}-Login`, {
            api_gateway: api_gateway,
            admin_user_pool: props.admin_user_pool,
            layers: all_layers,
            users_table: props.users_table,
            email_rate_limiter_table: props.email_rate_limiter_table
        });

        const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
            api_gateway: api_gateway,
            user_pool: props.admin_user_pool,
            user_type: "admin",
            layers: all_layers
        });

        new MSC_PayFastConstruct(this, `${id}-PayFast`, {
            api_gateway: api_gateway,
            token_authorizer: jwt_construct.token_authorizer,
            club_table: props.club_table,
            layers: all_layers,
            kms_key: props.kms_key,
            billing_table: props.billing_table,
            transactions_table: props.transactions_table
        });

        new MSC_TransactionsConstruct(this, `${id}-Transactions`, {
            api_gateway: api_gateway,
            layers: all_layers,
            token_authorizer: jwt_construct.token_authorizer,
            transactions_table: props.transactions_table
        });

        new MSC_ReportingConstruct(this, `${id}-Reporting`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            billing_table: props.billing_table,
            layers: all_layers,
            token_authorizer: jwt_construct.token_authorizer,
            registrations_table: props.registrations_table,
            registration_form_table: props.registration_form_table,
            club_history_bucket: props.club_history_bucket,
            orders_table: props.orders_table
        });

        new MSC_DeregistrationConstruct(this, `${id}-Deregistration`, {
            api_gateway: api_gateway,
            transactions_table: props.transactions_table,
            club_table: props.club_table,
            billing_table: props.billing_table,
            club_deregistration_queue: props.club_deregistration_queue,
            club_member_table: props.club_member_table,
            club_history_bucket: props.club_history_bucket,
            layers: all_layers,
            registration_form_table: props.registration_form_table,
            registrations_table: props.registrations_table,
            token_authorizer: jwt_construct.token_authorizer,
            signatures_bucket: props.signatures_bucket,
            orders_table: props.orders_table
        });

        new MSC_MailerConstruct(this, `${id}-Mail`, {
            api_gateway: api_gateway,
            users_table: props.users_table,
            club_table: props.club_table,
            layers: all_layers,
            billing_table: props.billing_table,
            token_authorizer: jwt_construct.token_authorizer,
            mail_queue: props.mail_queue
        });

        new MSC_AdminUserConstruct(this, `${id}-User`, {
            api_gateway: api_gateway,
            users_table: props.users_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: all_layers,
            kms_key: props.kms_key
        });

        new MSC_AdminClubConstruct(this, `${id}-Club`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: all_layers,
            image_bucket: props.image_bucket,
            registration_form_table: props.registration_form_table
        });

        new MSC_ClubAdminClubConstruct(this, `${id}-ClubAdmin`, {
            api_gateway: api_gateway,
            registration_form_table: props.registration_form_table,
            token_authorizer: jwt_construct.token_authorizer,
            club_admin_table: props.club_admin_table,
            club_table: props.club_table,
            layers: all_layers
        });

        new MSC_MemberUserConstruct(this, `${id}-MemberUser`, {
            api_gateway: api_gateway,
            layers: all_layers,
            token_authorizer: jwt_construct.token_authorizer,
            users_table: props.users_table,
            kms_key: props.kms_key
        });

        new MSC_AdminRegistrationFormConstruct(this, `${id}-RegistrationForm`, {
            api_gateway: api_gateway,
            registration_form_table: props.registration_form_table,
            signatures_bucket: props.signatures_bucket,
            club_table: props.club_table,
            club_member_table: props.club_member_table,
            registrations_table: props.registrations_table,
            club_admin_table: props.club_admin_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: all_layers,
            transactions_table: props.transactions_table,
            kms_key: props.kms_key
        });

        new MSC_ClubMemberClubConstruct(this, `${id}-ClubMember`, {
            api_gateway: api_gateway,
            signatures_bucket: props.signatures_bucket,
            users_table: props.users_table,
            member_user_pool: props.member_user_pool,
            transactions_table: props.transactions_table,
            club_table: props.club_table,
            club_member_table: props.club_member_table,
            token_authorizer: jwt_construct.token_authorizer,
            registration_form_table: props.registration_form_table,
            billing_table: props.billing_table,
            registrations_table: props.registrations_table,
            layers: all_layers,
            mail_queue: props.mail_queue,
            kms_key: props.kms_key
        });
    }
}