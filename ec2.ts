import { DescribeInstancesCommand, EC2Client, type Tag } from "@aws-sdk/client-ec2";
import { ignoreTags, type ResourceDict } from "./constants";
import { getThisMonth, isBeforeThisMonth, isValidDate } from "./utility";
import type { Resource } from "@aws-sdk/client-resource-explorer-2";
import { fromEnv } from "@aws-sdk/credential-providers";

export const ec2list = async (json: ResourceDict | undefined, thisMonth: Date): Promise<string> => {
    if (!json) return '⚠️ EC2インスタンスの削除候補を取得できませんでした';

    let message = '# EC2インスタンスの削除';
    const empty_tag_list = '\n💡タグ無し削除\n';
    const remove_list = '\n💡月末削除\n';
    const over_list = '\n💡期限超過削除\n';
    const error_list = '\n💡エラー日付削除\n';

    // リージョンごとに仕分けしたタグチェックの対象リスト
    let removeIds: { [K: string]: string[] } = {};
    /**
     * インスタンスごとにタグチェックを行い削除リストを返す
     * @param resources - チェック対象インスタンス
     * @param list - リストの概要
     * @param checkLogic - タグチェックのロジック
     * @returns 削除対象リスト
     */
    const checkResource = async (resources: Resource[], list: string, checkLogic: (tags: Tag[] | undefined) => boolean | undefined) => {
        let target_found = false;

        // regionごとにinstance idを仕分け
        for (const r of resources) {
            const region: string = r.Region ?? '';
            let id: string = r.Arn ?? '';
            // arnの末尾`i-[0-9a-z]{8,17}`を取得
            const match = id.match(/i-[0-9a-z]{8,17}$/);
            if (match) id = match[0];
            
            if (!removeIds[region]) removeIds[region] = [];
            removeIds[region].push(id);
        }
    
        for (const entries of Object.entries(removeIds)) {
            const region = entries[0];
            const command = new DescribeInstancesCommand({
            "InstanceIds": [...entries[1]],
            });
            const ec2Client = new EC2Client({
                credentials: fromEnv(),
                region: region,
            });
            try {
                const res = await ec2Client.send(command);
                res.Reservations?.forEach(r =>
                    r.Instances?.forEach(i => {
                        const tags = i.Tags;
                        // Nameタグのみのリソース
                        if (checkLogic(tags)) {
                            target_found = true;
                            const id = i.InstanceId ?? '';
                            const name = tags?.find(t => t?.Key === 'Name')?.Value ?? '';
                            list +=
`💣 Id: ${id}
    - Name: ${name}
    - Region: ${region}\n`;
                        }
                    })
                );
            } catch (error) {
                if ((error as any).errorType === 'InvalidInstanceID.NotFound') {
                    target_found = true;
                    list += '💯対象無し\n';
                } else {
                    console.error(error);
                }
            };
        }

        if (!target_found) {
            list += '💯対象無し\n';
        }
        removeIds = {};
        return list;
    }

    // タグ無し削除
    message += await checkResource(
        json.emptyTag.sort((a, b) => (a.Region ?? '') >= (b.Region ?? '') ? 1 : -1),
        empty_tag_list,
        (tags) => tags?.every(t => ignoreTags.includes(t?.Key ?? ''))
    );

    // 月末削除
    message += await checkResource(
        json.remove.sort((a, b) => (a.Region ?? '') >= (b.Region ?? '') ? 1 : -1),
        remove_list,
        (tags) => tags?.some(t => t?.Key === `${thisMonth.getFullYear()}${thisMonth.getMonth().toString().padStart(2, '0')}`)
    )

    // 期限超過削除
    message += await checkResource(
        json.over.sort((a, b) => (a.Region ?? '') >= (b.Region ?? '') ? 1 : -1),
        over_list,
        (tags) => tags?.some(t => isBeforeThisMonth((t as {[K: string]: string}), thisMonth))
    )

    // エラー日付削除
    message += await checkResource(
        json.error.sort((a, b) => (a.Region ?? '') >= (b.Region ?? '') ? 1 : -1),
        error_list,
        (tags) => tags?.some(t => !isValidDate((t as {[K: string]: string})))
    )

    return message;
}
