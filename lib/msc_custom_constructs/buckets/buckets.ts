import { Construct } from "constructs";
import { MSC_Bucket } from "../../msc_service_constructs"

interface MSC_BucketsProps {

}

export class MSC_BucketsConstruct extends Construct {
    public readonly image_bucket: MSC_Bucket;
    public readonly club_history_bucket: MSC_Bucket;
    constructor(scope: Construct, id: string, props: MSC_BucketsProps) {
        super(scope, `${id}-Buckets`);

        this.image_bucket = new MSC_Bucket(this, `${id}-Images`, {
            bucket_name: `${process.env.ENVIRONMENT as string}-${id}-Images`.toLocaleLowerCase(),
            enableCors: true
        });

        this.club_history_bucket = new MSC_Bucket(this, `${id}-Reporting`, {
            bucket_name: `${process.env.ENVIRONMENT as string}-${id}-Reporting`.toLocaleLowerCase()
        });
    }
}
