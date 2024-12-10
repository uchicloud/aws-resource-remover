import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import type { Handler } from "aws-lambda";
import path from "path";
import { messageDict, type ResourceDict } from "./constants";
import { getThisMonth, send_message } from "./utility";
import { ec2list } from "./ec2";
import { rdsdblist } from "./rds";


const bucket = process.env.S3_BUCKET ?? '';
const s3Client = new S3Client({
    credentials: fromEnv(),
})

export const handler: Handler = async (event, context): Promise<string> => {
    const { skipNotify } = event;
    const thisMonth = getThisMonth();

    const [ec2message, rdsmessage, clustermessage] = await Promise.all([
        tagcheck_specified_resourcetype(messageDict['resourcetype:ec2:instance_en'], thisMonth)
            .then(ec2json => ec2list(ec2json, thisMonth)),
        tagcheck_specified_resourcetype(messageDict['resourcetype:rds:db_en'], thisMonth)
            .then(rdsjson => rdsdblist(
                rdsjson, messageDict['resourcetype:rds:db'], thisMonth)),
        tagcheck_specified_resourcetype(messageDict['resourcetype:rds:cluster_en'], thisMonth)
            .then(clusterjson => rdsdblist(
                clusterjson, messageDict['resourcetype:rds:cluster'], thisMonth)),
    ]);

    console.log(ec2message);
    console.log(rdsmessage);
    console.log(clustermessage);

    if (!skipNotify) {
        try {
            await Promise.all([
                send_message(ec2message),
                send_message(rdsmessage),
                send_message(clustermessage)]);
        } catch (e) {
            if (e instanceof Error) {
                console.error(e.message);
            } else {
                console.error(e);
            }
        }
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
