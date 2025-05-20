import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway } from '../../msc_service_constructs';
import { MSC_JWTConstruct } from '../authorization';
import { MSC_MemberLoginConstruct } from "./constructs";
import { MSC_Table } from "../../msc_service_constructs"

export interface MSC_MemberNestedStackProps extends StackProps {
    users_table: MSC_Table;
    club_users_table: MSC_Table;
}

export class MSC_MemberNestedStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_MemberNestedStackProps) {
        super(scope, id);

        const api_gateway = new MSC_APIGateway(this, id);

        new MSC_JWTConstruct(this, `${id}-Auth`, { 
            api_gateway: api_gateway, user_type: "member" 
        });
        
        new MSC_MemberLoginConstruct(this, `${id}-Login`, { 
            api_gateway: api_gateway, users_table: props.users_table 
        });
    }
}