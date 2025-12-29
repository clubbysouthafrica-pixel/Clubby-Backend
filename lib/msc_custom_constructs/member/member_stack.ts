import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway, MSC_Bucket, MSC_Cognito, MSC_Kms, MSC_LambdaLayer, MSC_Queue } from '../../msc_service_constructs';
import { MSC_JWTConstruct } from '../authorization';
import {
    MSC_MemberLoginConstruct,
    MSC_MemberUserConstruct,
    MSC_MemberClubConstruct,
    MSC_MemberRegistrationFormConstruct,
    MSC_ClubMemberConstruct,
    MSC_ImagesConstruct,
    MSC_TransactionsConstruct,
    MSC_PayfastConstruct
} from "./constructs";
import { MSC_Table } from "../../msc_service_constructs";

export interface MSC_MemberNestedStackProps extends StackProps {
    users_table: MSC_Table;
    club_table: MSC_Table;
    member_user_pool: MSC_Cognito;
    club_member_table: MSC_Table;
    registration_form_table: MSC_Table;
    registrations_table: MSC_Table;
    transactions_table: MSC_Table;
    image_bucket: MSC_Bucket;
    signatures_bucket: MSC_Bucket;
    mail_queue: MSC_Queue;
    billing_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
        jwks_rsa_layer: MSC_LambdaLayer;
        axios_layer: MSC_LambdaLayer;
    };
    kms_key: MSC_Kms;
}

export class MSC_MemberNestedStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_MemberNestedStackProps) {
        super(scope, id, props);

        const api_gateway = new MSC_APIGateway(this, id, {
            domain: "member",
            cert_arn: process.env.MEMBER_CERT_ARN as string
        });

        new MSC_MemberLoginConstruct(this, `${id}-Login`, {
            api_gateway: api_gateway, users_table: props.users_table,
            user_pool: props.member_user_pool,
            layers: props.layers
        });

        const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
            api_gateway: api_gateway, user_type: "member",
            user_pool: props.member_user_pool,
            layers: props.layers
        });

        new MSC_PayfastConstruct(this, `${id}-Payfast`, {
            api_gateway: api_gateway,
            mail_queue: props.mail_queue,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers,
            user_pool: props.member_user_pool,
            club_member_table: props.club_member_table,
            registrations_table: props.registrations_table,
            users_table: props.users_table,
            club_table: props.club_table,
            transactions_table: props.transactions_table,
            billing_table: props.billing_table,
        });

        new MSC_TransactionsConstruct(this, `${id}-Transactions`, {
            api_gateway: api_gateway,
            layers: props.layers,
            token_authorizer: jwt_construct.token_authorizer,
            transactions_table: props.transactions_table
        })

        new MSC_ImagesConstruct(this, `${id}-Images`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            image_bucket: props.image_bucket,
            layers: props.layers,
            token_authorizer: jwt_construct.token_authorizer
        });

        new MSC_ClubMemberConstruct(this, `${id}-ClubMember`, {
            api_gateway: api_gateway,
            signatures_bucket: props.signatures_bucket,
            club_member_table: props.club_member_table,
            registrations_table: props.registrations_table,
            registration_form_table: props.registration_form_table,
            users_table: props.users_table,
            club_table: props.club_table,
            token_authorizer: jwt_construct.token_authorizer,
            transactions_table: props.transactions_table,
            layers: props.layers,
            mail_queue: props.mail_queue,
            billing_table: props.billing_table,
            kms_key: props.kms_key
        });

        new MSC_MemberRegistrationFormConstruct(this, `${id}-RegistrationForm`, {
            api_gateway: api_gateway,
            registration_form_table: props.registration_form_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers,
            club_table: props.club_table,
            club_member_table: props.club_member_table,
            registrations_table: props.registrations_table,
            signatures_bucket: props.signatures_bucket,
            kms_key: props.kms_key,
            image_bucket: props.image_bucket
        });

        new MSC_MemberClubConstruct(this, `${id}-Club`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            registration_form_table: props.registration_form_table,
            registrations_table: props.registrations_table,
            club_member_table: props.club_member_table,
            token_authorizer: jwt_construct.token_authorizer,
            image_bucket: props.image_bucket,
            layers: props.layers,
            signatures_bucket: props.signatures_bucket
        });

        new MSC_MemberUserConstruct(this, `${id}-User`, {
            api_gateway: api_gateway,
            club_member_table: props.club_member_table,
            users_table: props.users_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers,
            kms_key: props.kms_key
        });
    }
}