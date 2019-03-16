"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aws_iam_1 = require("@aws-cdk/aws-iam");
const aws_lambda_1 = require("@aws-cdk/aws-lambda");
const aws_s3_1 = require("@aws-cdk/aws-s3");
const aws_serverless_1 = require("@aws-cdk/aws-serverless");
const cdk_1 = require("@aws-cdk/cdk");
class AlexaSkillStack extends cdk_1.Stack {
    constructor(parent, config) {
        super(parent, config.skillName);
        this.templateOptions.description = `The Alexa Skill ${config.skillName}`;
        const aws = new cdk_1.ScopedAws(this);
        const assetBucket = new aws_s3_1.Bucket(this, 'AssetBucket', {
            bucketName: `${aws.accountId}-${config.skillName}-${aws.region}-assets`,
        });
        assetBucket.grantPublicAccess();
        const userTable = new aws_serverless_1.CfnSimpleTable(this, 'AttributesTable', {
            primaryKey: {
                name: config.userAttribute || 'id',
                type: 'String',
            },
        });
        const functionConfig = {
            handler: 'bundle.handler',
            runtime: 'nodejs8.10',
            timeout: 10,
            autoPublishAlias: 'latest',
            codeUri: './skill/dist/bundle.js',
            policies: [
                {
                    statement: new aws_iam_1.PolicyStatement()
                        .addActions('dynamodb:Batch*', 'dynamodb:DeleteItem', 'dynamodb:Get*', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query', 'dynamodb:Scan')
                        // tslint:disable-next-line:no-invalid-template-strings
                        .addResource(cdk_1.Fn.sub('arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${AttributesTable}')),
                },
            ],
            environment: {
                variables: Object.assign({}, config.environment, { TABLE_NAME: userTable.ref, ASSET_BUCKET: assetBucket.bucketName, ASSET_BUCKET_URL: assetBucket.bucketUrl, SKILL_ID: config.skillId }),
            },
        };
        if (config.thundraKey) {
            functionConfig.runtime = 'provided';
            functionConfig.layers = [`arn:aws:lambda:${aws.region}:269863060030:layer:thundra-lambda-node-layer:7`];
            functionConfig.environment
                .variables.thundra_apiKey = config.thundraKey;
        }
        const skillFunction = new aws_serverless_1.CfnFunction(this, 'SkillFunction', functionConfig);
        const skillFunctionPermission = new aws_lambda_1.CfnPermission(this, 'SkillFunctionPermission', {
            action: 'lambda:invokeFunction',
            // tslint:disable-next-line:no-invalid-template-strings
            functionName: cdk_1.Fn.sub('${SkillFunction.Version}'),
            principal: 'alexa-appkit.amazon.com',
        });
        skillFunctionPermission.options.deletionPolicy = cdk_1.DeletionPolicy.Retain;
        skillFunctionPermission.options.updateReplacePolicy = cdk_1.DeletionPolicy.Retain;
        const deployOutput = new cdk_1.Output(this, 'overrides', {
            // tslint:disable-next-line:no-invalid-template-strings
            value: cdk_1.Fn.sub('{"manifest": {"apis": {"custom": {"endpoint": {"uri": "${SkillFunction.Version}"}}}}}'),
        });
    }
}
exports.AlexaSkillStack = AlexaSkillStack;
//# sourceMappingURL=skill.js.map