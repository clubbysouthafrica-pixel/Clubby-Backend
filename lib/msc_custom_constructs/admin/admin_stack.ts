import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway } from '../../msc_service_constructs';
import { 
    MSC_AdminLoginConstruct, 
    MSC_AdminUserConstruct, 
    MSC_AdminClubConstruct,
    MSC_ClubAdminClubConstruct,
    MSC_AdminRegistrationFormConstruct,
    MSC_ClubMemberClubConstruct
} from "./constructs";
import { MSC_JWTConstruct } from "../authorization";
import { MSC_Table } from "../../msc_service_constructs";
import { MSC_Layers } from '../lambda_layers';

export interface MSC_AdminNestedStackProps extends StackProps {
    users_table: MSC_Table;
    club_table: MSC_Table;
    club_admin_table: MSC_Table;
    registration_form_table: MSC_Table;
    club_member_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_AdminNestedStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_AdminNestedStackProps) {
        super(scope, id);

        const api_gateway = new MSC_APIGateway(this, id);

        const login_construct = new MSC_AdminLoginConstruct(this, `${id}-Login`, {
            api_gateway: api_gateway, users_table: props.users_table,
            layers: props.layers
        });

        const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, { 
            api_gateway: api_gateway, 
            user_pool: login_construct.user_pool,
            user_type: "admin",
            layers: props.layers
        });

        new MSC_AdminUserConstruct(this, `${id}-User`, {
            api_gateway: api_gateway,
            users_table: props.users_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers
        });

        new MSC_AdminClubConstruct(this, `${id}-Club`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers
        });

        new MSC_ClubAdminClubConstruct(this, `${id}-ClubAdmin`, {
            api_gateway: api_gateway,
            club_table: props.club_table,
            token_authorizer: jwt_construct.token_authorizer,
            users_table: props.users_table,
            club_admin_table: props.club_admin_table,
        });

        new MSC_AdminRegistrationFormConstruct(this, `${id}-RegistrationForm`, {
            api_gateway: api_gateway,
            registration_form_table: props.registration_form_table,
            club_table: props.club_table,
            club_admin_table: props.club_admin_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers
        });

        new MSC_ClubMemberClubConstruct(this, `${id}-GetAllClubMembers`, {
            api_gateway: api_gateway,
            club_member_table: props.club_member_table,
            token_authorizer: jwt_construct.token_authorizer,
            layers: props.layers
        });
    }
}