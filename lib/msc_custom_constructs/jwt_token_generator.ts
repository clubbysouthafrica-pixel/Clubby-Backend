import { Construct } from "constructs";
import { MSC_Lambda } from "../msc_service_constructs";

interface MSC_JWTConstructProps {  }

export class MSC_JWTConstruct extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        new MSC_Lambda(this, `${id}-TokenGenerator`, {
            code: "generate_jwt_token",
            envVariables: {
                JWT_SECRET: "myclubsoftware_secret",
                USER_ID: "myclubsoftware_342129",
                TOKEN: "mf508mf959mfn44",
            }
        })
    }
}
