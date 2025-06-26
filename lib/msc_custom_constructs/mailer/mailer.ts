import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_Layers } from '../lambda_layers';
import { MSC_SendEmailConstruct } from "./constructs";

export interface MSC_MailingStackProps extends StackProps {
    layers: MSC_Layers;
}

export class MSC_MailingStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_MailingStackProps) {
        super(scope, id, props);

        new MSC_SendEmailConstruct(this, `${id}-SendMail`, {
            layers: props.layers
        });
    }
}