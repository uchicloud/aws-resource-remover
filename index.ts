import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import type { Handler } from "aws-lambda";
import path from "path";
import { messageDict, type ResourceDict } from "./constants";
import { getThisMonth, send_message } from "./utility";
import { ec2list } from "./ec2";


const bucket = process.env.S3_BUCKET ?? '';
const s3Client = new S3Client({
    credentials: fromEnv(),
})

export const handler: Handler = async (event, context): Promise<string> => {
    const { skipNotify } = event;
    const thisMonth = getThisMonth();

    const ec2json = await tagcheck_specified_resourcetype(messageDict['resourcetype:ec2:instance_en'], thisMonth);
    const ec2message = await ec2list(ec2json, thisMonth);
    console.log(ec2message);
    if (!skipNotify) {
        await send_message(ec2message);
    }

    return context.logStreamName;
}

const tagcheck_specified_resourcetype = async (resourcetype: string, thisMonth: Date): Promise<ResourceDict | undefined> => {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: path.posix.join('delete-candidates', thisMonth.toISOString().slice(0, 10), resourcetype, 'resources.json'),
    });

    const { Body } = await s3Client.send(command);
    if (Body) {
        return JSON.parse(await Body.transformToString());
    }

    return undefined;
}
