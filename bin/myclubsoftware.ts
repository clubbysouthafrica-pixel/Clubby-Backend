import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MSC_Stack } from '../lib/stack';
import * as dotenv from 'dotenv';

dotenv.config();

const app = new cdk.App();
new MSC_Stack(app, "MCS", {
    env: {
        account: process.env.ACCOUNT,
        region: process.env.REGION,
    },
});