import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway, MSC_Bucket, MSC_Queue } from '../../msc_service_constructs';
import { MSC_JWTConstruct } from '../authorization';
import { 
    MSC_MemberLoginConstruct, 
    MSC_MemberUserConstruct, 
    MSC_MemberClubConstruct ,
    MSC_MemberRegistrationFormConstruct,
    MSC_ClubMemberConstruct,
    MSC_ImagesConstruct,
    MSC_TransactionsConstruct
} from "./constructs";
import { MSC_Table } from "../../msc_service_constructs"
import { MSC_Layers } from '../lambda_layers';

export interface MSC_MemberNestedStackProps extends StackProps {
    users_table: MSC_Table;
    club_table: MSC_Table;
    club_member_table: MSC_Table;
    registration_form_table: MSC_Table;
    registrations_table: MSC_Table;
    club_reporting_table: MSC_Table;
    update_registration_reporting_queue: MSC_Queue;
    transactions_table: MSC_Table;
    image_bucket: MSC_Bucket;
    layers: MSC_Layers;
}

export class MSC_MemberNestedStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_MemberNestedStackProps) {
        super(scope, id, props);

        const api_gateway = new MSC_APIGateway(this, id, {
            domain: "member",
            cert_arn: process.env.MEMBER_CERT_ARN as string
        });

        const login_construct = new MSC_MemberLoginConstruct(this, `${id}-Login`, {
            api_gateway: api_gateway, users_table: props.users_table,
            layers: props.layers
        });

        const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
            api_gateway: api_gateway, user_type: "member",
            user_pool: login_construct.user_pool,
            layers: props.layers
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
            update_registration_reporting_queue: props.update_registration_reporting_queue,
            club_member_table: props.club_member_table,
            registrations_table: props.registrations_table,
            registration_form_table: props.registration_form_table,
            club_reporting_table: props.club_reporting_table,
            users_table: props.users_table,
            club_table: props.club_table,
            token_authorizer: jwt_construct.token_authorizer,
            transactions_table: props.transactions_table,
            image_bucket: props.image_bucket,
            layers: props.layers
        });

        new MSC_MemberRegistrationFormConstruct(this, `${id}-RegistrationForm`, {
            api_gateway: api_gateway,
            registration_form_table: props.registration_form_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers
        });

        new MSC_MemberClubConstruct(this, `${id}-Club`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            registrations_table: props.registrations_table,
            club_member_table: props.club_member_table,
            token_authorizer: jwt_construct.token_authorizer,
            image_bucket: props.image_bucket,
            layers: props.layers
        });

        new MSC_MemberUserConstruct(this, `${id}-User`, {
            api_gateway: api_gateway,
            club_member_table: props.club_member_table,
            users_table: props.users_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers
        });
    }
}