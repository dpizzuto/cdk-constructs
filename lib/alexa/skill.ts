import { PolicyStatement } from '@aws-cdk/aws-iam';
import { CfnPermission } from '@aws-cdk/aws-lambda';
import { Bucket } from '@aws-cdk/aws-s3';
import { CfnFunction, CfnSimpleTable } from '@aws-cdk/aws-sam';
import { App, CfnDeletionPolicy, CfnOutput, Fn, ScopedAws, Stack } from '@aws-cdk/core';

export interface AlexaSkillConfig {
    /** The Alexa Skill id */
    readonly skillId : string;

    /** The Alexa Skill name */
    readonly skillName : string;

    /** Optional API Key for Thundra */
    readonly thundraKey? : string;

    /** Environement variables for the Lambda function */
    readonly environment? : { [key : string] : string };

    /**
     * name of the user attribute for DynamoDB
     * @default id
     */
    readonly userAttribute? : string;
}

export class AlexaSkillStack extends Stack {
    constructor(parent : App, config : AlexaSkillConfig) {
        super(parent, config.skillName);
        this.templateOptions.description = `The Alexa Skill ${config.skillName}`;
        const aws = new ScopedAws(this);

        const assetBucket = new Bucket(this, 'AssetBucket', {
            bucketName: `${aws.accountId}-${config.skillName}-${aws.region}-assets`,
        });
        assetBucket.grantPublicAccess();

        const userTable = new CfnSimpleTable(this, 'AttributesTable', {
            primaryKey: {
                name: config.userAttribute || 'id',
                type: 'String',
            },
        });

        new CfnFunction(this, 'SkillFunction', {
            handler: 'dist/index.handler',
            runtime: 'nodejs8.10',
            timeout: 10,
            autoPublishAlias: 'latest',
            codeUri: './skill/dist/bundle.zip',
            policies: [
                {
                    statement: new PolicyStatement({
                        actions: ['dynamodb:Batch*', 'dynamodb:DeleteItem', 'dynamodb:Get*', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query', 'dynamodb:Scan'],
                        // tslint:disable-next-line:no-invalid-template-strings
                        resources: [Fn.sub('arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${AttributesTable}')],
                    }),
                },
            ],
            environment: {
                variables: {
                    ...config.environment,
                    TABLE_NAME: userTable.ref,
                    ASSET_BUCKET: assetBucket.bucketName,
                    ASSET_BUCKET_URL: assetBucket.bucketWebsiteUrl,
                    SKILL_ID: config.skillId,
                    ...config.thundraKey && { thundra_apiKey: config.thundraKey },
                },
            },
            ...config.thundraKey && {
                runtime: 'provided',
                layers: [`arn:aws:lambda:${aws.region}:269863060030:layer:thundra-lambda-node-layer:12`],
            },
        });

        const skillFunctionPermission = new CfnPermission(this, 'SkillFunctionPermission', {
            action: 'lambda:invokeFunction',
            // tslint:disable-next-line:no-invalid-template-strings
            functionName: Fn.sub('${SkillFunction.Version}'),
            principal: 'alexa-appkit.amazon.com',
        });
        skillFunctionPermission.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN;
        skillFunctionPermission.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.RETAIN;

        new CfnOutput(this, 'overrides', {
            // tslint:disable-next-line:no-invalid-template-strings
            value: Fn.sub('{"manifest": {"apis": {"custom": {"endpoint": {"uri": "${SkillFunction.Version}"}}}}}'),
        });
    }
}
