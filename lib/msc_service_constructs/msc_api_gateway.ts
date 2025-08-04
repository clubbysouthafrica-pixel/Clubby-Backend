import { BasePathMapping, DomainName, EndpointType, ResponseType, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGatewayDomain } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

interface MSC_APIGatewayProps {
    domain: string;
    cert_arn: string;
}

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string, props: MSC_APIGatewayProps) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
            endpointConfiguration: {
                types: [EndpointType.REGIONAL]
            }
        });
        
        const domain_name = `${props.domain}.${(process.env.DOMAIN as string)}`;
        const hosted_zone_domain = process.env.DOMAIN as string;
        const certificate_arn = props.cert_arn;

        const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
            domainName: hosted_zone_domain,
        });

        const certificate = Certificate.fromCertificateArn(
            this,
            'Certificate',
            certificate_arn
        );

        const customDomain = new DomainName(this, `${props.domain}-CustomDomain`, {
            domainName: domain_name,
            certificate,
            endpointType: EndpointType.REGIONAL,
        });

        new BasePathMapping(this, `${props.domain}-BasePathMapping`, {
            domainName: customDomain,
            restApi: this,
            basePath: '',
        });

        new ARecord(this, `${props.domain}-ApiAliasRecord`, {
            zone: hostedZone,
            recordName: domain_name,
            target: RecordTarget.fromAlias(new ApiGatewayDomain(customDomain)),
        });

        this.addGatewayResponse('UnauthorizedResponse', {
            type: ResponseType.UNAUTHORIZED,
            responseHeaders: {
                'Access-Control-Allow-Origin': `'${process.env.ALLOWED_ORIGIN}'`,
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });

        this.addGatewayResponse('AccessDeniedResponse', {
            type: ResponseType.ACCESS_DENIED,
            responseHeaders: {
                'Access-Control-Allow-Origin': `'${process.env.ALLOWED_ORIGIN}'`,
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });
    }
}
