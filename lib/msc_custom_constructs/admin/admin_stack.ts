import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway } from '../../msc_service_constructs';
import { MSC_AdminLoginConstruct } from "./constructs";
import { MSC_JWTConstruct } from "../authorization"

export interface MSC_AdminNestedStackProps extends StackProps {
}

export class MSC_AdminNestedStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const api_gateway = new MSC_APIGateway(this, id);

        new MSC_JWTConstruct(this, `${id}-Auth`, { api_gateway: api_gateway, user_type: "admin" })
        new MSC_AdminLoginConstruct(this, `${id}-Login`, { api_gateway: api_gateway });
    }
}